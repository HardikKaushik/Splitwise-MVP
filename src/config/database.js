require('dotenv/config');

const config = {
  dialect: process.env.DB_DIALECT || 'sqlite',
  define: {
    timestamps: true,
  },
};

if (process.env.DB_DIALECT === 'sqlite') {
  config.storage = process.env.DB_STORAGE || './splitwise.db';
} else {
  config.host = process.env.DB_HOST;
  config.username = process.env.DB_USER;
  config.password = process.env.DB_PASS;
  config.database = process.env.DB_NAME;
}

module.exports = config;
