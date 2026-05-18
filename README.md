# Buggy 测试管理平台

Buggy 是一个面向测试团队的项目、迭代、需求、用例、测试执行、缺陷和验收报告管理系统。

## 本地开发

```bash
npm install
npm run types:build
npm run api:dev
npm run web:dev
```

API 默认运行在 `http://localhost:3400/api`，Web 默认运行在 `http://localhost:5173`。

## Docker 部署

```bash
docker compose up --build
```

部署后访问 `http://localhost:28090`。MongoDB 数据保存在 `./mongo_data`。

## 首次使用

第一个注册用户会自动成为系统管理员。后续用户默认是测试角色，可由管理员在项目成员中分配项目角色。
