const winston = require('winston');
const config = require('./config');

const customLevels = {
    levels: {
        error: 0,
        warn: 1,
        info: 2,
        debug: 3,
    },
    colors: {
        error: 'red',
        warn: 'yellow',
        info: 'blue',
        debug: 'gray',
    }
};

winston.addColors(customLevels.colors);

module.exports = winston.createLogger({
    level: config.relayer.logLevel,
    levels: customLevels.levels,
    format: winston.format.combine(
        winston.format.colorize({ all: true }),
        winston.format.timestamp({ format: 'HH:mm:ss' }),
        winston.format.printf(({ timestamp, level, message }) =>
            `[${timestamp}] ${level}: ${message}`
        ),
    ),
    transports: [
        new winston.transports.Console(),
    ],
});