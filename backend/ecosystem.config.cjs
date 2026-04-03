module.exports = {
  apps: [{
    name: "imgbed",
    script: "server.js",
    cwd: "/home/ubuntu/imgbed-yunjunet-cn/backend",
    env: {
      NODE_ENV: "production",
      PORT: "3022",
      INTERNAL_API_SECRET: "${INTERNAL_API_SECRET}",
      STORAGE_PATH: "/home/ubuntu/imgbed-storage",
      BASE_URL: "https://demo001.opensora2.cn"
    }
  }]
};
