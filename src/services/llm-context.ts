import { and, eq } from "drizzle-orm";
import type { AppDatabase } from "../db/client.ts";
import { chatMembers, members } from "../db/schema.ts";
import { env } from "../env.ts";
import { getRecentChatSnippets } from "./chat-snippets.ts";
import { getRecentLlmGenerations } from "./llm-generations.ts";
import { getMemberCheckinHistory } from "./summary.ts";
import { buildMemberStats } from "./streak.ts";
import { formatMemberMention } from "./window-message.ts";

export interface ParticipantRosterEntry {
  mention: string;
  soberCurrent: number;
  soberMax: number;
  intoxCurrent: number;
  intoxMax: number;
  totalSoberDays: number;
  totalSlipDays: number;
}

export interface LlmStyleExample {
  kind: string;
  text: string;
}

export interface LlmChatSnippet {
  authorName: string;
  text: string;
}

export interface LlmBaseContext {
  chatSnippets: LlmChatSnippet[];
  styleExamples: LlmStyleExample[];
  participants: ParticipantRosterEntry[];
}

export async function buildParticipantRosterStats(
  db: AppDatabase,
  chatId: number,
  asOfDate: string,
): Promise<ParticipantRosterEntry[]> {
  const joined = await db
    .select({
      memberId: chatMembers.memberId,
      username: members.username,
      displayName: members.displayName,
    })
    .from(chatMembers)
    .innerJoin(members, eq(chatMembers.memberId, members.id))
    .where(and(eq(chatMembers.chatId, chatId), eq(chatMembers.active, true)));

  const roster: ParticipantRosterEntry[] = [];
  for (const member of joined) {
    const history = await getMemberCheckinHistory(db, chatId, member.memberId, asOfDate);
    const stats = buildMemberStats(history, asOfDate);
    roster.push({
      mention: formatMemberMention(member.username, member.displayName),
      soberCurrent: stats.soberCurrent,
      soberMax: stats.soberMax,
      intoxCurrent: stats.intoxCurrent,
      intoxMax: stats.intoxMax,
      totalSoberDays: stats.totalSoberDays,
      totalSlipDays: stats.totalSlipDays,
    });
  }
  return roster;
}

export async function buildLlmBaseContext(
  db: AppDatabase,
  chatId: number,
  asOfDate: string,
): Promise<LlmBaseContext> {
  const [chatSnippets, styleExamples, participants] = await Promise.all([
    getRecentChatSnippets(db, chatId, env.LLM_CHAT_CONTEXT_COUNT),
    getRecentLlmGenerations(db, chatId),
    buildParticipantRosterStats(db, chatId, asOfDate),
  ]);
  return { chatSnippets, styleExamples, participants };
}

export function formatChatBlock(chatSnippets: LlmChatSnippet[]): string {
  if (chatSnippets.length === 0) return "(тишина в чате)";
  return chatSnippets.map((s) => `- ${s.authorName}: ${s.text}`).join("\n");
}

export function formatStyleBlock(styleExamples: LlmStyleExample[]): string {
  if (styleExamples.length === 0) return "(нет примеров)";
  return styleExamples.map((e) => `- [${e.kind}] ${e.text}`).join("\n");
}

export function formatRosterBlock(participants: ParticipantRosterEntry[]): string {
  if (participants.length === 0) return "[]";
  return JSON.stringify(
    participants.map((p) => ({
      mention: p.mention,
      sober: p.soberCurrent,
      soberMax: p.soberMax,
      intox: p.intoxCurrent,
      intoxMax: p.intoxMax,
    })),
    null,
    2,
  );
}

/** Delete window invitation on close when no Telegram reply or reaction (button taps don't count). */
export function shouldDeleteWindowInvitation(hasReply: boolean, hasReaction: boolean): boolean {
  return !hasReply && !hasReaction;
}
