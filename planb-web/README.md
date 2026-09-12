# Plan B 网页版

小程序前端的独立手机网页备份版，无构建依赖。

## 本地运行

在本目录执行：

```powershell
python -m http.server 4173
```

访问 `http://127.0.0.1:4173`。默认 `demoMode: true`，数据保存在浏览器 localStorage。

正式部署前在 `config.js` 填写 HTTPS API 地址，并完成网页身份认证。微信小程序的 `wx.login`、手机号授权和小程序码能力不能直接照搬到普通浏览器，生产环境应使用微信公众号 OAuth、短信认证或企业统一身份认证。
