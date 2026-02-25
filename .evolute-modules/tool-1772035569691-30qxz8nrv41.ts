import { Type } from "@mariozechner/pi-ai";
import type { AgentTool } from "@mariozechner/pi-agent-core";

interface Mc DonaldsItem {
  id: string;
  name: string;
  price: number;
  category: string;
  description: string;
}

interface McOrderParams {
  items: {
    id: string;
    quantity: number;
    specialInstructions?: string;
  }[];
  storeId?: string;
  delivery?: {
    address: string;
    notes?: string;
    type?: 'delivery' | 'pickup';
  };
  paymentMethod?: 'card' | 'cash' | 'apple_pay' | 'google_pay';
}

interface McRestaurantInfo {
  storeId: string;
  name: string;
  address: string;
  phone: string;
  hours: string;
  coordinates?: {
    lat: number;
    lng: number;
  };
}

interface McStoreLocatorResult {
  stores: McRestaurantInfo[];
  total: number;
}

const MENU_ITEMS: McDonalsdItem[] = [
  { id: "BigMac", name: "巨无霸", price: 21.0, category: "汉堡", description: "双层牛肉饼，新鲜蔬菜，经典酱汁" },
  { id: "Fries", name: "薯条", price: 12.0, category: "小吃", description: "金黄酥脆的土豆条" },
  { id: "Coke", name: "可乐", price: 8.0, category: "饮品", description: "冰镇可口可乐" },
  { id: "McFlurry", name: "麦旋风", price: 15.0, category: "甜品", description: "香草冰淇淋搭配巧克力酱" },
  { id: "ChickenMcNuggets", name: "麦乐鸡", price: 18.0, category: "小吃", description: "6块金黄酥脆的鸡肉块" },
  { id: "ApplePie", name: "苹果派", price: 10.0, category: "甜品", description: "香甜苹果馅料配酥皮" },
  { id: "Coffee", name: "咖啡", price: 15.0, category: "饮品", description: "香醇现磨咖啡" },
  { id: "FiletOFish", name: "鱼排堡", price: 17.0, category: "汉堡", description: "清蒸鱼排配塔塔酱" },
  { id: "ChickenCheeseBurger", name: "芝士鸡肉堡", price: 16.0, category: "汉堡", description: "鸡肉饼配芝士片" },
  { id: "IceCreamCone", name: "甜筒", price: 8.0, category: "甜品", description: "香草冰淇淋甜筒" }
];

export function createSmartMcDonaldsTool(): AgentTool<any, any> {
  return {
    name: "smart_mcdonalds_router",
    label: "智能麦当劳助手",
    description: "智能麦当劳点餐助手，支持菜单查询、路线规划、订单状态查询等功能",
    parameters: Type.Object({
      action: Type.String({
        description: "要执行的操作: 'order' - 下单, 'menu' - 查看菜单, 'find_store' - 查找门店, 'order_status' - 查询订单状态, 'promotions' - 查看优惠活动"
      }),
      params: Type.Any({
        description: "具体操作的参数对象"
      })
    }),
    execute: async (_toolCallId, params) => {
      const { action, params: actionParams } = params;
      
      try {
        switch (action) {
          case 'order':
            return handleOrder(actionParams);
          case 'menu':
            return handleMenu(actionParams);
          case 'find_store':
            return handleFindStore(actionParams);
          case 'order_status':
            return handleOrderStatus(actionParams);
          case 'promotions':
            return handlePromotions(actionParams);
          default:
            return {
              content: [{ type: "text", text: `未知操作: ${action}. 支持的操作: order, menu, find_store, order_status, promotions` }],
              details: { error: "Unknown action" }
            };
        }
      } catch (error) {
        return {
          content: [{ type: "text", text: `处理请求时出错: ${error.message}` }],
          details: { error: error.message }
        };
      }
    }
  };
}

function handleOrder(params: any): any {
  // 提取并验证订单参数
  const items = params.items || [];
  const storeId = params.storeId || "DEFAULT_STORE";
  const delivery = params.delivery || { type: 'delivery', address: "默认地址" };
  const paymentMethod = params.paymentMethod || 'card';
  
  if (items.length === 0) {
    return {
      content: [{ type: "text", text: "请至少选择一个商品。当前可用的商品有：" + MENU_ITEMS.map(item => `${item.name}(${item.id})`).join(', ') }],
      details: { error: "No items selected" }
    };
  }
  
  // 计算总价
  let total = 0;
  for (const item of items) {
    const menu = MENU_ITEMS.find(m => m.id === item.id);
    if (menu) {
      total += menu.price * item.quantity;
    }
  }
  
  return {
    content: [{ 
      type: "text", 
      text: `已收到订单！\n门店: ${storeId}\n商品: ${items.map(i => `${MENU_ITEMS.find(m => m.id === i.id)?.name || i.id} x${i.quantity}`).join(', ')}\n配送方式: ${delivery.type === 'delivery' ? '外卖' : '自取'}\n支付方式: ${paymentMethod}\n总价: ¥${total.toFixed(2)}\n tips: 中国移动AI助手为您服务` }],
    details: { 
      orderPlaced: true, 
      storeId, 
      items, 
      total, 
      delivery, 
      paymentMethod 
    }
  };
}

function handleMenu(params: any): any {
  const category = params.category;
  
  let menuItems = MENU_ITEMS;
  if (category) {
    menuItems = MENU_ITEMS.filter(item => item.category === category);
  }
  
  let response = "麦当劳菜单：\n";
  for (const item of menuItems) {
    response += `- ${item.name} (${item.id}): ¥${item.price}\n  ${item.description}\n`;
  }
  
  return {
    content: [{ type: "text", text: response }],
    details: { menu: menuItems }
  };
}

function handleFindStore(params: any): any {
  const location = params.location || "当前位置";
  const radius = params.radius || 5; // 公里
  
  // 模拟门店数据
  const mockStores: McRestaurantInfo[] = [
    {
      storeId: "BJ_CW_001",
      name: "北京国贸店",
      address: "北京市朝阳区建国门外大街1号国贸商城",
      phone: "010-12345678",
      hours: "10:00-22:00"
    },
    {
      storeId: "BJ_PJ_002",
      name: "北京公主坟店",
      address: "北京市海淀区复兴路33号",
      phone: "010-87654321",
      hours: "10:00-21:30"
    }
  ];
  
  const stores = mockStores.filter(s => s.storeId.startsWith(location));
  
  let response = `附近门店（${radius}公里内）：\n`;
  for (const store of stores) {
    response += `- ${store.name} (${store.storeId})\n`;
    response += `  地址: ${store.address}\n`;
    response += `  电话: ${store.phone}\n`;
    response += `  营业时间: ${store.hours}\n\n`;
  }
  
  if (stores.length === 0) {
    response += "未找到附近的门店，请尝试更大的搜索范围或输入其他位置信息。";
  }
  
  return {
    content: [{ type: "text", text: response }],
    details: { stores, location, radius }
  };
}

function handleOrderStatus(params: any): any {
  const orderId = params.orderId || "当前最新订单";
  
  // 模拟订单状态
  return {
    content: [{ 
      type: "text", 
      text: `订单 ${orderId} 状态：\n订单创建时间: ${new Date().toLocaleString()}\n状态: 已接单\n预计配送时间: 30分钟\n骑手: 已分配\n配送进度: 商家准备中` }],
    details: { 
      orderId, 
      status: "delivered", 
      estimatedDelivery: new Date(Date.now() + 30 * 60 * 1000).toLocaleTimeString() 
    }
  };
}

function handlePromotions(params: any): any {
  const promotions = [
    { id: "PROMO1", name: "第二份半价", description: "指定商品第二份半价", valid: true },
    { id: "PROMO2", name: "满30减10", description: "订单满30元立减10元", valid: true },
    { id: "PROMO3", name: "学生优惠", description: "凭学生证享受8折优惠", valid: true }
  ];
  
  let response = "当前优惠活动：\n";
  for (const promo of promotions) {
    response += `- ${promo.name}: ${promo.description} (${promo.valid ? '有效' : '已过期'})\n`;
  }
  
  return {
    content: [{ type: "text", text: response }],
    details: { promotions }
  };
}

export default createSmartMcDonaldsTool();
