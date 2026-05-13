// Same asset as app.json "expo.icon" — keep push/tray icons aligned with the store icon.
const APP_ICON = "./icon.png";
const NOTIFICATION_COLOR = "#2D5A3D";

module.exports = ({ config }) => {
  const plugins = (config.plugins ?? []).map((entry) => {
    if (entry === "expo-notifications") {
      return ["expo-notifications", { icon: APP_ICON, color: NOTIFICATION_COLOR }];
    }
    if (Array.isArray(entry) && entry[0] === "expo-notifications") {
      const [, opts = {}] = entry;
      return [
        "expo-notifications",
        {
          ...opts,
          icon: APP_ICON,
          color: opts.color ?? NOTIFICATION_COLOR,
        },
      ];
    }
    return entry;
  });

  return {
    ...config,
    icon: APP_ICON,
    plugins,
    android: {
      ...config.android,
      googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? "./google-services.json",
      notification: {
        ...config.android?.notification,
        icon: APP_ICON,
        color: config.android?.notification?.color ?? NOTIFICATION_COLOR,
      },
    },
  };
};
