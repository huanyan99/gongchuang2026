package com.example.app.controller;

import com.example.app.service.WechatLoginService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Arrays;

/**
 * 公众号消息回调（公众号后台「服务器配置」指向本接口）：
 * - GET  ：填写服务器配置时的 URL 有效性验证（echostr 原样返回）
 * - POST ：关注事件 / 文本消息 → 被动回复「登录码 + 一键登录链接」
 * 使用明文模式即可；未认证订阅号同样可用，不依赖网页授权。
 */
@Slf4j
@RestController
@RequestMapping("/api/wechat")
@RequiredArgsConstructor
public class WechatCallbackController {

    private final WechatLoginService wechatLoginService;

    @Value("${wechat.callback-token}")
    private String callbackToken;

    /** 服务器配置验证：signature = sha1(sort(token, timestamp, nonce))，通过则原样返回 echostr */
    @GetMapping(value = "/callback", produces = MediaType.TEXT_PLAIN_VALUE)
    public String verify(@RequestParam("signature") String signature,
                         @RequestParam("timestamp") String timestamp,
                         @RequestParam("nonce") String nonce,
                         @RequestParam("echostr") String echostr) {
        if (!signatureValid(signature, timestamp, nonce)) {
            log.warn("公众号回调签名校验失败（GET）");
            return "fail";
        }
        return echostr;
    }

    /** 消息与事件推送：关注(subscribe)或任意文本消息，回复登录码与一键登录链接 */
    @PostMapping(value = "/callback", produces = MediaType.APPLICATION_XML_VALUE)
    public String receive(@RequestParam("signature") String signature,
                          @RequestParam("timestamp") String timestamp,
                          @RequestParam("nonce") String nonce,
                          @RequestBody String body) {
        if (!signatureValid(signature, timestamp, nonce)) {
            log.warn("公众号回调签名校验失败（POST）");
            return "success";
        }
        String fromUser = extractTag(body, "FromUserName");
        String msgType = extractTag(body, "MsgType");
        String event = extractTag(body, "Event");
        boolean subscribe = "event".equals(msgType) && "subscribe".equals(event);
        boolean text = "text".equals(msgType);
        if (fromUser == null || (!subscribe && !text)) {
            return "success";
        }
        boolean welcome = subscribe;
        String content = wechatLoginService.buildReplyContent(fromUser, welcome)
                .replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;");
        log.info("公众号登录回复：openid 尾号 {}，welcome={}", tail(fromUser), welcome);
        return "<xml>"
                + "<ToUserName><![CDATA[" + fromUser + "]]></ToUserName>"
                + "<FromUserName><![CDATA[" + extractTag(body, "ToUserName") + "]]></FromUserName>"
                + "<CreateTime>" + (System.currentTimeMillis() / 1000) + "</CreateTime>"
                + "<MsgType><![CDATA[text]]></MsgType>"
                + "<Content><![CDATA[" + content + "]]></Content>"
                + "</xml>";
    }

    private boolean signatureValid(String signature, String timestamp, String nonce) {
        if (signature == null || timestamp == null || nonce == null) {
            return false;
        }
        String[] parts = {callbackToken, timestamp, nonce};
        Arrays.sort(parts);
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-1");
            byte[] hash = digest.digest(String.join("", parts).getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder();
            for (byte b : hash) {
                hex.append(String.format("%02x", b));
            }
            return hex.toString().equals(signature);
        } catch (Exception e) {
            return false;
        }
    }

    /** 提取 XML 标签值，兼容 CDATA 与纯文本两种格式 */
    private String extractTag(String xml, String tag) {
        if (xml == null || tag == null) {
            return null;
        }
        java.util.regex.Matcher matcher = java.util.regex.Pattern
                .compile("<" + tag + ">(?:<!\\[CDATA\\[)?(.*?)(?:\\]\\]>)?</" + tag + ">", java.util.regex.Pattern.DOTALL)
                .matcher(xml);
        return matcher.find() ? matcher.group(1).trim() : null;
    }

    private String tail(String value) {
        return value == null ? "null" : value.substring(Math.max(0, value.length() - 6));
    }
}
