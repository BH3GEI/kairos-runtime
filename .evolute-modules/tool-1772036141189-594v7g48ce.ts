import { Type } from "@mariozechner/pi-ai";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import type { Context } from "@mariozechner/pi-ai";

interface McpClientState {
  nextId: number;
  config: { mcpToken: string; defaultStoreId: string };
}

export function createMcdonaldsMCPTool(): AgentTool<McpClientState, Record<string, unknown>> {
  return {
    name: "mcdonalds_mcp",
    label: "麦当劳MCP客户端",
    description: "麦当劳MCP客户端路由器，支持点餐、门店查询、优惠活动等操作",
    parameters: Type.Object({
      action: Type.String({
        description: "操作类型: order(点餐), get_stores(查询门店), get_store_info(门店详情), get_promotions(优惠), check_order_status(订单状态), cancel_order(取消订单)",
        enum: ["order", "get_stores", "get_store_info", "get_promotions", "check_order_status", "cancel_order"]
      }),
      storeId: Type.String({ description: "门店ID", optional: true }),
      items: Type.Array(Type.Object({
        id: Type.String({ description: "商品ID" }),
        quantity: Type.Number({ description: "数量", minimum: 1, maximum: 99 })
      }), { description: "订单商品", optional: true }),
      delivery: Type.Object({
        address: Type.String({ description: "配送地址" }),
        notes: Type.String({ description: "配送备注", optional: true })
      }, { description: "配送信息", optional: true }),
      orderId: Type.String({ description: "订单ID", optional: true }),
      latitude: Type.Number({ description: "纬度", optional: true }),
      longitude: Type.Number({ description: "经度", optional: true }),
      radius: Type.Number({ description: "搜索半径(公里)", optional: true, minimum: 1, maximum: 50 }),
      limit: Type.Number({ description: "结果数量", optional: true, minimum: 1, maximum: 100 })
    }),
    execute: async (_toolCallId, params, ctx) => {
      const state = ctx.state as McpClientState | null;
      const config = state?.config || { mcpToken: "1r9miccJQh1GvHK37fK6ivDa2BpI944t", defaultStoreId: "BEIJING_CW" };
      const storeId = params.storeId || config.defaultStoreId;
      
      try {
        let result;
        switch (params.action) {
          case "order": result = await orderFood({ storeId, items: params.items, delivery: params.delivery }); break;
          case "get_stores": result = await searchStores({ latitude: params.latitude, longitude: params.longitude, radius: params.radius, limit: params.limit }); break;
          case "get_store_info": result = await getStoreInfo({ storeId }); break;
          case "get_promotions": result = await getPromotions({ storeId, limit: params.limit }); break;
          case "check_order_status": result = await checkOrderStatus({ orderId: params.orderId }); break;
          case "cancel_order": result = await cancelOrder({ orderId: params.orderId }); break;
          default: result = { success: false, data: { message: "不支持的操作" } };
        }
        
        const response = buildResponse(params.action, result);
        return {
          content: [{ type: "text", text: response.text }],
          details: { success: result.success, result: result.data, action: params.action }
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `操作失败: ${error instanceof Error ? error.message : String(error)}` }],
          details: { success: false, error: error instanceof Error ? error.message : String(error), action: params.action }
        };
      }
    },
    getState: () => ({ nextId: 1, config: { mcpToken: "1r9miccJQh1GvHK37fK6ivDa2BpI944t", defaultStoreId: "BEIJING_CW" } }),
    setState: (state) => state
  };
}

async function orderFood(params: {storeId: string; items?: any[]; delivery?: any}): Promise<any> {
  return {
    success: true,
    data: {
      orderId: `MC${Date.now()}`,
      storeId: params.storeId,
      totalPrice: 45.00,
      estimatedTime: "15分钟",
      status: "pending",
      items: params.items || [{ id: "BigMac", quantity: 2 }],
      delivery: params.delivery || { address: "默认地址", notes: "" }
    }
  };
}

async function searchStores(params: {latitude?: number; longitude?: number; radius?: number; limit?: number}): Promise<any> {
  const stores = [
    { storeId: "BEIJING_CW", name: "北京王府井店", address: "北京市东城区王府井大街100号", phone: "010-12345678", distance: 2.5, hours: "10:00-22:00" },
    { storeId: "BEIJING_PA", name: "北京.Powder Station", address: "北京市朝阳区建国路88号", phone: "010-87654321", distance: 5.0, hours: "08:00-23:00" }
  ];
  return { success: true, data: { stores: stores.slice(0, params.limit || 20) } };
}

async function getStoreInfo(params: {storeId: string}): Promise<any> {
  return {
    success: true,
    data: {
      storeId: params.storeId,
      name: params.storeId === "BEIJING_CW" ? "北京王府井店" : "其他门店",
      address: "北京市测试区测试路123号",
      phone: "010-12345678",
      hours: "10:00-22:00",
      facilities: ["drive-thru", "delivery", "wifi"],
      manager: "张三",
      rating: 4.5
    }
  };
}

async function getPromotions(params: {storeId: string; limit?: number}): Promise<any> {
  const promotions = [
    { title: "巨无霸半价", description: "购买任意巨无霸套餐，第二份半价", discount: "第二份半价", validUntil: "2026-03-01" },
    { title: "薯条买一送一", description: "每周三薯条买一送一", discount: "买一送一", validUntil: "2026-12-31" }
  ];
  return { success: true, data: { promotions: promotions.slice(0, params.limit || 10) } };
}

async function checkOrderStatus(params: {orderId?: string}): Promise<any> {
  return {
    success: true,
    data: {
      orderId: params.orderId || "测试订单",
      status: "preparing",
      estimatedTime: "15分钟",
      totalPrice: 45.00,
      items: [{ name: "巨无霸套餐", quantity: 1, price: 35.00 }]
    }
  };
}

async function cancelOrder(params: {orderId?: string}): Promise<any> {
  return {
    success: true,
    data: {
      orderId: params.orderId || "测试订单",
      cancelled: true,
      refundAmount: 45.00,
      reason: "customer_request"
    }
  };
}

function buildResponse(action: string, result: any): {text: string} {
  if (!result.success) {
    return { text: `❌ 操作失败: ${result.data?.message || "未知错误"}` };
  }
  
  const data = result.data;
  switch (action) {
    case "order":
      if (data.orderId) {
        return { 
          text: `✅ 订单创建成功!\n\n📊 订单信息:\n- 订单ID: ${data orderId}\n- 店铺ID: ${data.storeId}\n- 总金额: ¥${data.totalPrice}\n- 预计时间: ${data.estimatedTime}\n- 状态: ${data.status}\n\n📦 商品详情:\n${data.items.map((item: any) => `- ${item.name || item.id} x${item.quantity}`).join('\n')}\n\n📍 配送信息:\n- 地址: ${data.delivery?.address}` 
        };
      }
      return { text: "❌ 订单创建失败" };
    
    case "get_stores":
      if (data.stores?.length) {
        let text = `📍 找到 ${data.stores.length} 家门店\n\n`;
        data.stores.forEach((store: any, idx: number) => {
          text += `${idx + 1}. ${store.name} [${store.storeId}]\n`;
          if (store.distance) text += `   📍 距离: ${store.distance}公里\n`;
          if (store.address) text += `   🗺️ 地址: ${store.address}\n`;
          if (store.phone) text += `   ☎️ 电话: ${store.phone}\n`;
          if (store.hours) text += `   ⏰ 营业时间: ${store.hours}\n`;
          text += `\n`;
        });
        return { text };
      }
      return { text: "❌ 未找到门店" };
    
    case "get_store_info":
      if (data) {
        let text = `🏪 门店信息 [${data.storeId}]\n\n`;
        if (data.name) text += `名称: ${data.name}\n`;
        if (data.address) text += `地址: ${data.address}\n`;
        if (data.phone) text += `电话: ${data.phone}\n`;
        if (data.hours) text += `营业时间: ${data.hours}\n`;
        if (data.facilities) text += `设施: ${data.facilities.join(', ')}\n`;
        if (data.manager) text += `经理: ${data.manager}\n`;
        if (data.rating) text += `评分: ⭐ ${data.rating}\n`;
        return { text };
      }
      return { text: "❌ 无法获取门店信息" };
    
    case "get_promotions":
      if (data.promotions?.length) {
        let text = `🎉 发现 ${data.promotions.length} 个优惠活动\n\n`;
        data.promotions.forEach((promo: any, idx: number) => {
          text += `${idx + 1}. ${promo.title}\n`;
          if (promo.description) text += `   📝 ${promo.description}\n`;
          if (promo.discount) text += `   💰 ${promo.discount}\n`;
          if (promo.validUntil) text += `   📅 截止: ${promo.validUntil}\n`;
          text += `\n`;
        });
        return { text };
      }
      return { text: "❌ 没有优惠活动" };
    
    case "check_order_status":
      if (data) {
        let text = `📋 订单状态 [${data.orderId}]\n\n`;
        text += `当前状态: ${data.status}\n`;
        if (data.estimatedTime) text += `预计时间: ${data.estimatedTime}\n`;
        if (data.totalPrice) text += `总金额: ¥${data.totalPrice}\n`;
        if (data.items) {
          text += `\n📦 订单详情:\n`;
          data.items.forEach((item: any) => {
            text += `- ${item.name} x${item.quantity} ¥${item.price}\n`;
          });
        }
        return { text };
      }
      return { text: "❌ 无法查询订单状态" };
    
    case "cancel_order":
      if (data.cancelled) {
        let text = `❌ 订单取消成功\n\n`;
        text += `订单ID: ${data.orderId}\n`;
        if (data.refundAmount) text += `退款金额: ¥${data.refundAmount}\n`;
        if (data.reason) text += `原因: ${data.reason}\n`;
        return { text };
      }
      return { text: "❌ 订单取消失败" };
    
    default:
      return { text: JSON.stringify(data, null, 2) };
  }
}

export default createMcdonaldsMCPTool();
