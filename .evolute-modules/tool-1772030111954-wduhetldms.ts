import { Type } from "@mariozechner/pi-ai";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { createNeteaseCloudMusicApi } from "NeteaseCloudMusicApi";

interface NeteaseCloudMusicApiDetails {
  apiVersion: string;
  functionName: string;
  success: boolean;
}

export function createNeteaseMusicTool(): AgentTool<any, NeteaseCloudMusicApiDetails> {
  // 初始化网易云音乐 API 实例
  const api = createNeteaseCloudMusicApi({
    ua: "netease-cloud-musicBoxNoCapBot/1.0",
    cookiePath: "/tmp/netease_cookie.json"
  });

  return {
    name: "netease_music_api",
    label: "网易云音乐 API",
    description: "提供网易云音乐相关操作，支持：登录、搜索歌曲、获取歌曲详情、播放、喜欢、下载歌词等功能",
    parameters: Type.Object({
      action: Type.String({
        description: "操作类型，可选值：login, search, song_detail, play_url, like, lyric",
      }),
      phone: Type.String({
        description: "登录时使用的手机号（仅 action=login 时需要）",
        optional: true,
      }),
      password: Type.String({
        description: "登录时使用的密码（仅 action=login 时需要）",
        optional: true,
      }),
      keyword: Type.String({
        description: "搜索关键词（仅 action=search 时需要）",
        optional: true,
      }),
      limit: Type.Number({
        description: "返回结果数量限制（仅 search 相关操作时使用）",
        default: 10,
        optional: true,
      }),
      songId: Type.String({
        description: "歌曲 ID（仅 action=song_detail, play_url, like, lyric 时需要）",
        optional: true,
      }),
      level: Type.String({
        description: "音质等级: standard, exhigh, lossless, hires（仅 action=play_url 时使用）",
        default: "exhigh",
        optional: true,
      }),
    }),
    execute: async (_toolCallId, params) => {
      try {
        let result: any = {};

        switch (params.action) {
          case "login":
            // 手机号登录
            if (!params.phone || !params.password) {
              result = {
                status: "error",
                message: "缺少必要参数：phone 和 password"
              };
            } else {
              const loginResult = await api.loginCellphone({
                phone: params.phone,
                password: params.password,
              });
              result = loginResult;
            }
            break;

          case "search":
            // 搜索歌曲
            if (!params.keyword) {
              result = {
                status: "error",
                message: "缺少必要参数：keyword"
              };
            } else {
              const searchResult = await api.search({
                keywords: params.keyword,
                limit: params.limit || 10,
                type: 1, // 1 表示搜索歌曲
              });
              result = searchResult;
            }
            break;

          case "song_detail":
            // 获取歌曲详情
            if (!params.songId) {
              result = {
                status: "error",
                message: "缺少必要参数：songId"
              };
            } else {
              const detailResult = await api.songDetail({
                id: params.songId,
              });
              result = detailResult;
            }
            break;

          case "play_url":
            // 获取歌曲播放链接
            if (!params.songId) {
              result = {
                status: "error",
                message: "缺少必要参数：songId"
              };
            } else {
              const urlResult = await api.songUrl({
                id: params.songId,
                level: params.level as any || "exhigh",
              });
              result = urlResult;
            }
            break;

          case "like":
            // 喜欢/取消喜欢歌曲
            if (!params.songId) {
              result = {
                status: "error",
                message: "缺少必要参数：songId"
              };
            } else {
              const likeResult = await api.likeSong({
                id: params.songId,
                like: true,
              });
              result = likeResult;
            }
            break;

          case "lyric":
            // 获取歌词
            if (!params.songId) {
              result = {
                status: "error",
                message: "缺少必要参数：songId"
              };
            } else {
              const lyricResult = await api.lyric({
                id: params.songId,
              });
              result = lyricResult;
            }
            break;

          default:
            result = {
              status: "error",
              message: "不支持的操作类型"
            };
        }

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          details: {
            apiVersion: "4.2.0",
            functionName: `netease_${params.action}`,
            success: result.status !== "error"
          },
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `操作失败: ${error.message}` }],
          details: {
            apiVersion: "4.2.0",
            functionName: params.action,
            success: false
          },
        };
      }
    },
  };
}

export default createNeteaseMusicTool();
