import "dotenv/config";

function required(key: string): string {
    const value = process.env[key];
    if (!value) {
        throw new Error(`환경변수 ${key}가 없습니다`);
    }
    return value;
}

export const env = {
    PORT: Number(process.env.PORT ?? 4000),
    DATABASE_URL: required("DATABASE_URL"),
    JWT_SECRET: required("JWT_SECRET"),
    JWT_REFRESH_SECRET: required("JWT_REFRESH_SECRET"),
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN ?? "1h",
};
