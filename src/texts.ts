export const texts = {
  help: `Sushkabot — вечерний чек-ин сушки

Команды в группе:
/stats — твоя статистика и стрики
/help — этот список

Админам:
/setup — настроить группу
/config — изменить настройки

В личке:
/settings — часовой пояс

Боту нужны права админа на удаление сообщений и Privacy Mode выключен.`,

  setupDone: "Setup complete! Check-ins will run on schedule.",
  notGroup: "This command only works in groups.",
  notAdmin: "Only admins can run this command.",
  notConfigured: "This chat is not set up yet. An admin should run /setup.",
  joinSuccess: "You joined check-in tracking for this chat.",
  leaveSuccess: "You left check-in tracking. Past check-ins are kept.",
  alreadyJoined: "You are already tracked in this chat.",
  notJoined: "You are not tracked in this chat.",
  checkinSober: "Красавчик 💪",
  checkinMinorSlip: "Записано",
  checkinMajorSlip: "Принято",
  checkinClosed: "Окно закрыто",
  forceOpenDone: "Check-in window opened.",
  forceCloseDone: "Check-in window closed and summary posted.",
  devOnly: "This command is only available in development mode.",
  invalidTime: "Invalid time. Use HH:MM in 24h format.",
  invalidTimezone: "Invalid timezone. Use an IANA name like Europe/Moscow.",
  invalidDuration: "Invalid duration. Enter a positive number of minutes.",
  invalidPreset: "Invalid preset. Use yes_no, yes_no_note, or sober_slip_skip.",
  settingsDmOnly: "Use /settings in a private chat with me.",
  settingsSaved: "Timezone saved.",
  settingsCleared: "Timezone override cleared.",
  botRemoved: "Bot was removed from a group; chat disabled.",
};
