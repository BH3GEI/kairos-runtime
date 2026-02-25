import { Type } from "@mariozechner/pi-ai";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import type { Context } from "@mariozechner/pi-ai";

interface McpRequest {
  jsonrpc: string;
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

interface McpResponse {
  jsonrpc: string;
  id: number | string;
  result?: Record<string, unknown>;
  error?: {
    code: number;
    message: string;
  };
}

interface麦当劳MCPConfig {
  serverUrl?: string;
  mcpToken: string;
  defaultStoreId?: string;
  defaultDeliveryAddress?: string;
}

interface McpClientState {
  nextId: number;
  config: 麦当劳MCPConfig;
}

export function createMcdonaldsMCPTool(): AgentTool<McpClientState, Record<string, unknown>> {
  return {
    name: "mcdonalds_mcp",
    label: "麦当劳MCP客户端",
    description: "麦当劳MCP客户端，支持多种麦当劳相关工具调用，包括点餐、查询门店信息、获取优惠券等",
    parameters: Type.Object({
      action: Type.String({
        description: "要执行的操作类型",
        enum: ["order", "get_stores", "get_promotions", "get_store_info", "cancel_order", "check_order_status"]
      }),
      storeId: Type.String({
        description: "门店ID（可选，默认使用配置中的门店）",
        optional: true
      }),
      items: Type.Array(Type.Object({
        id: Type.String({ description: "商品ID，如'BigMac'、'Fries'、'Coke'等" }),
        quantity: Type.Number({ description: "数量", minimum: 1, maximum: 99 }),
        modifications: Type.String({
          description: "定制修改说明（可选，如'不加洋葱'）",
          optional: true
        })
      }), {
        description: "订单商品列表（仅order操作需要）"
      }),
      delivery: Type.Object({
        address: Type.String({ description: "配送地址（配送订单必填）" }),
        notes: Type.String({
          description: "配送备注（可选）",
          optional: true
        })
      }, {
        description: "配送信息（配送订单需要）",
        optional: true
      }),
      orderId: Type.String({
        description: "订单ID（订单状态查询、取消等操作需要）",
        optional: true
      }),
      latitude: Type.Number({
        description: "纬度（查询附近门店时使用）",
        optional: true
      }),
      longitude: Type.Number({
        description: "经度（查询附近门店时使用）",
        optional: true
      }),
      radius: Type.Number({
        description: "搜索半径（公里）",
        optional: true,
        minimum: 1,
        maximum: 50
      }),
      limit: Type.Number({
        description: "返回结果数量限制",
        optional: true,
        minimum: 1,
        maximum: 100
      })
    }),
    execute: async (_toolCallId, params, ctx) => {
      const state = ctx.state as McpClientState | null;
      const config = state?.config || {
        mcpToken: params.token || "1r9miccJQh1GvHK37fK6ivDa2BpI944t",
        serverUrl: "https://mcp.mcdonalds.com/api/v1",
        defaultStoreId: "BEIJING_CW",
        defaultDeliveryAddress: ""
      };
      
      conststoreId = params.storeId || config.defaultStoreId;
      const defaultDeliveryAddress = config.defaultDeliveryAddress || "";
      
      try {
        // 构建MCP请求
        const mcpRequest: McpRequest = {
          jsonrpc: "2.0",
          id: state ? state.nextId++ : 1,
          method: `mcdonalds/${params.action}`
        };
        
        // 根据操作类型添加参数
        switch (params.action) {
          case "order":
            mcpRequest.params = {
              storeId,
              items: params.items,
              delivery: params.delivery || {
                address: defaultDeliveryAddress,
                notes: params.notes
              }
            };
            break;
            
          case "get_stores":
            mcpRequest.params = {
              latitude: params.latitude,
              longitude: params.longitude,
              radius: params.radius,
              limit: params.limit
            };
            break;
            
          case "get_store_info":
            mcpRequest.params = {
              storeId
            };
            break;
            
          case "check_order_status":
          case "cancel_order":
            mcpRequest.params = {
              orderId: params.orderId
            };
            break;
            
          case "get_promotions":
            mcpRequest.params = {
              storeId,
              limit: params.limit
            };
            break;
        }
        
        // 调用MCP服务
        const response = await fetch(`${config.serverUrl}/CallTool`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${config.mcpToken}`
          },
          body: JSON.stringify(mcpRequest)
        });
        
        if (!response.ok) {
          throw new Error(`MCP服务调用失败: ${response.status} ${response.statusText}`);
        }
        
        const mcpResponse: McpResponse = await response.json();
        
        // 处理MCP响应
        if (mcpResponse.error) {
          return {
            content: [{ type: "text", text: `MCP错误: ${mcpResponse.error.code} - ${mcpResponse.error.message}` }],
            details: { success: false, errorCode: mcpResponse.error.code }
          };
        }
        
        // 根据不同操作类型解析结果
        let resultText = "";
        const resultData = mcpResponse.result;
        
        if (params.action === "order") {
          if (resultData?.orderId) {
            resultText = `订单已创建，订单ID: ${resultData.orderId}\n`;
            if (resultData.estimatedTime) {
              resultText += `预计准备时间: ${resultData.estimatedTime}\n`;
            }
            if (resultData.totalPrice) {
              resultText += `总金额: ¥${resultData.totalPrice}\n`;
            }
            if (resultData.storeAddress) {
              resultText += `门店地址: ${resultData.storeAddress}\n`;
            }
          } else {
            resultText = "订单创建失败，无法获取订单详情";
          }
        } else if (params.action === "get_stores") {
          const stores = Array.isArray(resultData?.stores) ? resultData.stores : [];
          if (stores.length > 0) {
            resultText = `找到 ${stores.length} 家门店:\n`;
            stores.forEach((store: any, index: number) => {
              resultText += `${index + 1}. ${store.name || store.storeId} (${store.distance ? `距离${store.distance}公里` : ''})\n`;
              if (store.address) resultText += `   地址: ${store.address}\n`;
              if (store.hours) resultText += `   营业时间: ${store.hours}\n`;
            });
          } else {
            resultText = "未找到符合条件的门店";
          }
        } else if (params.action === "get_store_info") {
          if (resultData) {
            resultText = `门店信息:\n`;
            if (resultData.name) resultText += `名称: ${resultData.name}\n`;
            if (resultData.address) resultText += `地址: ${resultData.address}\n`;
            if (resultData.phone) resultText += `电话: ${resultData.phone}\n`;
            if (resultData.hours) resultText += `营业时间: ${resultData.hours}\n`;
            if (resultData.facilities) resultText += `设施: ${resultData.facilities.join(', ')}\n`;
          } else {
            resultText = "无法获取门店信息";
          }
        } else if (params.action === "check_order_status") {
          if (resultData?.status) {
            resultText = `订单状态查询结果:\n`;
            resultText += `订单ID: ${params.orderId}\n`;
            resultText += `当前状态: ${resultData.status}\n`;
            if (resultData.estimatedTime) resultText += `预计完成时间: ${resultData.estimatedTime}\n`;
            if (resultData.items) {
              resultText += `订单详情:\n`;
              resultData.items.forEach((item: any) => {
                resultText += `- ${item.name} x${item.quantity}\n`;
              });
            }
          } else {
            resultText = "无法查询订单状态";
          }
        } else if (params.action === "cancel_order") {
          if (resultData?.success) {
            resultText = `订单 ${params.orderId} 已成功取消`;
          } else {
            resultText = "订单取消失败";
          }
        } else if (params.action === "get_promotions") {
          const promotions = Array.isArray(resultData?.promotions) ? resultData.promotions : [];
          if (promotions.length > 0) {
            resultText = `发现 ${promotions.length} 个优惠活动:\n`;
            promotions.forEach((promo: any, index: number) => {
              resultText += `${index + 1}. ${promo.title || promo.name}\n`;
              if (promo.description) resultText += `   详情: ${promo.description}\n`;
              if (promo.validUntil) resultText += `   截止日期: ${promo.validUntil}\n`;
            });
          } else {
            resultText = "当前没有可用的优惠活动";
          }
        } else {
          // 其他操作返回原始结果
          resultText = JSON.stringify(resultData, null, 2);
        }
        
        return {
          content: [{ type: "text", text: resultText }],
          details: { 
            success: true, 
            result: resultData,
            action: params.action
          }
        };
        
      } catch (error) {
        return {
          content: [{ type: "text", text: `操作失败: ${error instanceof Error ? error.message : '未知错误'}` }],
          details: { 
            success: false, 
            error: error instanceof Error ? error.message : String(error),
            action: params.action
          }
        };
      }
    },
    getState: () => ({
      nextId: 1,
      config: {
        mcpToken: "1r9miccJQh1GvHK37fK6ivDa2BpI944t",
        serverUrl: "https://mcp.mcdonalds.com/api/v1",
        defaultStoreId: "BEIJING_CW",
        defaultDeliveryAddress: ""
      }
    }),
    setState: (state) => state
  };
}

export default createMcdonaldsMCPTool();
