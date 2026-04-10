# Linux Docker 部署

这个项目现在可以直接通过单容器 Docker Compose 在 Linux 上启动。

## 前置要求

- Docker Engine
- Docker Compose 插件

## 启动项目

```bash
docker compose up --build -d
```

启动后：

- 访问地址：`http://localhost:3001`
- 健康检查地址：`http://localhost:3001/api/health`

## 停止项目

```bash
docker compose down
```

## 自定义端口

```bash
APP_PORT=3001 docker compose up --build -d
```

## 自定义 npm 镜像源

默认使用国内镜像：

```bash
NPM_REGISTRY=https://registry.npmmirror.com docker compose build
```

如果要切回官方源：

```bash
NPM_REGISTRY=https://registry.npmjs.org docker compose build
```

## 说明

- Docker 会先构建前端，再由后端统一提供静态页面、`/api` 和 `/socket.io`
- 当前端没有设置 `VITE_SOCKET_URL` 时，会默认使用浏览器当前访问域名，适合 Docker 部署
- Docker 构建阶段支持通过 `NPM_REGISTRY` 覆盖 npm 源
