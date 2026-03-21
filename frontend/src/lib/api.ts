// API 基础 URL：生产环境使用环境变量，本地开发使用空字符串（走 Vite proxy）
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';