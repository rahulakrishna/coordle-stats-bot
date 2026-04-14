import 'dotenv/config';

const required = (name) => {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
};

export const config = {
  token: required('DISCORD_TOKEN'),
  snapshotHour: parseInt(process.env.SNAPSHOT_HOUR ?? '23', 10),
  dbPath: process.env.DB_PATH || './data/coordle.db',
};
