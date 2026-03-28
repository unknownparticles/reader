import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import axios from "axios";
import https from "https";

function buildProxyHeaders(parsedOptions: Record<string, any>, url: string) {
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    ...(parsedOptions.headers || {}),
  };

  if (!headers.Referer && typeof parsedOptions.referer === "string" && parsedOptions.referer.trim()) {
    headers.Referer = parsedOptions.referer.trim();
  }

  if (!headers.Referer) {
    headers.Referer = url;
  }

  return headers;
}

function buildProxyBody(parsedOptions: Record<string, any>, headers: Record<string, string>) {
  const body = parsedOptions.body;
  if (body == null || body === "") {
    return undefined;
  }

  const contentType = `${headers["Content-Type"] || headers["content-type"] || ""}`.toLowerCase();

  if (contentType.includes("application/x-www-form-urlencoded")) {
    if (typeof body === "string") {
      try {
        const parsed = JSON.parse(body);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          return new URLSearchParams(
            Object.entries(parsed).reduce<Record<string, string>>((result, [key, value]) => {
              result[key] = value == null ? "" : `${value}`;
              return result;
            }, {})
          ).toString();
        }
      } catch (error) {
        return body;
      }

      return body;
    }

    if (typeof body === "object" && !Array.isArray(body)) {
      return new URLSearchParams(
        Object.entries(body).reduce<Record<string, string>>((result, [key, value]) => {
          result[key] = value == null ? "" : `${value}`;
          return result;
        }, {})
      ).toString();
    }
  }

  if (contentType.includes("application/json")) {
    if (typeof body === "string") {
      try {
        return JSON.parse(body);
      } catch (error) {
        return body;
      }
    }

    return body;
  }

  return body;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Create an https agent that ignores SSL certificate errors
  const httpsAgent = new https.Agent({
    rejectUnauthorized: false,
  });

  // Proxy endpoint to bypass CORS for source files
  app.get("/api/proxy", async (req, res) => {
    const { url, options } = req.query;
    if (!url || typeof url !== "string") {
      return res.status(400).json({ error: "Missing URL parameter" });
    }

    try {
      let parsedOptions: Record<string, any> = {};
      if (typeof options === "string" && options.trim()) {
        try {
          parsedOptions = JSON.parse(options);
        } catch (error) {
          console.warn("Failed to parse proxy request options:", error);
        }
      }

      const method = typeof parsedOptions.method === "string" ? parsedOptions.method.toUpperCase() : "GET";
      const headers = buildProxyHeaders(parsedOptions, url);
      const requestBody = buildProxyBody(parsedOptions, headers);

      console.log(`Proxying request to: ${url}`);
      const response = await axios({
        url,
        method,
        headers,
        data: requestBody,
        timeout: 15000,
        httpsAgent, // Use the custom agent
      });
      
      // Ensure we send JSON if the response is JSON
      if (typeof response.data === 'string') {
        try {
          const jsonData = JSON.parse(response.data);
          res.json(jsonData);
        } catch (e) {
          res.send(response.data);
        }
      } else {
        res.json(response.data);
      }
    } catch (error: any) {
      console.error("Proxy error for URL:", url, error.message);
      const status = error.response?.status || 500;
      const message = error.response?.data?.message || error.message || "Failed to fetch remote source";

      // 前端是批量探测第三方源，直接回 4xx/5xx 会把控制台刷满。
      // 这里统一回 200，并通过响应头告诉前端这是一次上游失败。
      res
        .status(200)
        .set("X-Proxy-Error", "1")
        .set("X-Proxy-Status", String(status))
        .json({ error: message, status });
    }
  });

  // 图片单独走二进制代理，避免浏览器直接请求第三方图片时触发 CORS 和防盗链。
  app.get("/api/image", async (req, res) => {
    const { url, referer } = req.query;
    if (!url || typeof url !== "string") {
      return res.status(400).send("Missing URL parameter");
    }

    try {
      console.log(`Proxying image to: ${url}`);
      const response = await axios({
        url,
        method: "GET",
        responseType: "arraybuffer",
        timeout: 15000,
        maxRedirects: 5,
        httpsAgent,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
          "Referer": typeof referer === "string" && referer.trim() ? referer : url,
        },
      });

      const contentType = response.headers["content-type"] || "image/jpeg";
      res.set("Content-Type", contentType);
      res.set("Cache-Control", "public, max-age=3600");
      res.send(Buffer.from(response.data));
    } catch (error: any) {
      console.error("Image proxy error for URL:", url, error.message);
      res.status(502).send("Failed to fetch image");
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
