// app.json holds the configuration; this adds what depends on the build environment.
const fs = require('node:fs');
const path = require('node:path');

/**
 * Android push needs the publisher's Firebase project (`google-services.json`). EAS builds get it from a file
 * environment variable (`GOOGLE_SERVICES_JSON`); local builds from `apps/app/google-services.json`. Without
 * one the app builds and runs, and push settings explain that this build isn't set up for notifications.
 */
module.exports = ({ config }) => {
  const local = path.join(__dirname, 'google-services.json');
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON || (fs.existsSync(local) ? './google-services.json' : undefined);
  if (!googleServicesFile) return config;
  return { ...config, android: { ...config.android, googleServicesFile } };
};
