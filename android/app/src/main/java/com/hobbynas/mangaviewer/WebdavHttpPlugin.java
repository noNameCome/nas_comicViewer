package com.hobbynas.mangaviewer;

import android.util.Base64;
import androidx.annotation.NonNull;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.IOException;
import java.util.Iterator;
import java.util.concurrent.TimeUnit;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import okhttp3.ResponseBody;

@CapacitorPlugin(name = "WebdavHttp")
public class WebdavHttpPlugin extends Plugin {

    private OkHttpClient client;

    private OkHttpClient getClient() {
        if (client == null) {
            client = new OkHttpClient.Builder()
                .connectTimeout(30, TimeUnit.SECONDS)
                .readTimeout(120, TimeUnit.SECONDS)
                .writeTimeout(60, TimeUnit.SECONDS)
                .followRedirects(true)
                .build();
        }
        return client;
    }

    @PluginMethod
    public void request(final PluginCall call) {
        final String url = call.getString("url");
        if (url == null) {
            call.reject("url is required");
            return;
        }
        final String method = call.getString("method", "GET");
        final String bodyStr = call.getString("body");
        final boolean binary = Boolean.TRUE.equals(call.getBoolean("binary", false));
        final JSObject headers = call.getObject("headers");

        new Thread(() -> {
            try {
                Request.Builder builder = new Request.Builder().url(url);
                if (headers != null) {
                    Iterator<String> keys = headers.keys();
                    while (keys.hasNext()) {
                        String key = keys.next();
                        String value = headers.optString(key, null);
                        if (value != null) {
                            builder.addHeader(key, value);
                        }
                    }
                }

                boolean needsBody = "PROPFIND".equalsIgnoreCase(method)
                    || "POST".equalsIgnoreCase(method)
                    || "PUT".equalsIgnoreCase(method)
                    || "PATCH".equalsIgnoreCase(method)
                    || "REPORT".equalsIgnoreCase(method);

                RequestBody reqBody = null;
                if (bodyStr != null) {
                    reqBody = RequestBody.create(bodyStr, MediaType.parse("application/xml; charset=utf-8"));
                } else if (needsBody) {
                    reqBody = RequestBody.create(new byte[0], null);
                }

                builder.method(method, reqBody);

                try (Response response = getClient().newCall(builder.build()).execute()) {
                    JSObject ret = new JSObject();
                    ret.put("status", response.code());

                    JSObject hdrs = new JSObject();
                    for (String name : response.headers().names()) {
                        hdrs.put(name, response.header(name));
                    }
                    ret.put("headers", hdrs);

                    ResponseBody rb = response.body();
                    byte[] bytes = rb != null ? rb.bytes() : new byte[0];
                    if (binary) {
                        ret.put("data", Base64.encodeToString(bytes, Base64.NO_WRAP));
                    } else {
                        ret.put("data", new String(bytes, java.nio.charset.StandardCharsets.UTF_8));
                    }
                    call.resolve(ret);
                }
            } catch (IOException e) {
                call.reject("network error: " + e.getMessage(), e);
            } catch (Exception e) {
                call.reject("request failed: " + e.getMessage(), e);
            }
        }).start();
    }
}
