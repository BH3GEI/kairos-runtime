import { Type } from "@mariozechner/pi-ai";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { mcp_order_mcdonalds, mcdonalds_mcp } from "./tools";

interface MCPClientRouterParams {
  action: string;
  storeId?: string;
  items?: Array<{
    id: string;
    quantity: number;
    modifications?: string;
  }>;
  delivery?: {
    address: string;
    notes?: string;
  };
  pickup?: {
    name: string;
    phone: string;
  };
  orderId?: string;
  latitude?: number;
  longitude?: number;
  radius?: number;
  limit?: number;
  includeHours?: boolean;
  includeFacilities?: boolean;
  includeRating?: boolean;
  type?: string;
}

interface MCPClientRouterDetails {
  success: boolean;
  message: string;
  data?: any;
}

export function createMCPClientRouterTool(): AgentTool<MCPClientRouterParams, MCPClientRouterDetails> {
  return {
    name: "mcp_client_router",
    label: "MCP Client Router",
    description: "A comprehensive MCP client router that supports multiple operations including ordering, store lookup, promotions, and order management with intelligent parameter handling and defaults.",
    parameters: Type.Object({
      action: Type.String({
        description: "Operation type: 'order', 'get_stores', 'get_store_info', 'get_promotions', 'check_order_status', 'cancel_order'",
        enum: ["order", "get_stores", "get_store_info", "get_promotions", "check_order_status", "cancel_order"]
      }),
      storeId: Type.Optional(Type.String({ description: "Store ID for specific operations" })),
      items: Type.Optional(Type.Array(Type.Object({
        id: Type.String({ description: "Item ID (e.g., 'BigMac', 'Fries', 'Coke')" }),
        quantity: Type.Number({ minimum: 1, maximum: 99, description: "Quantity of the item" }),
        modifications: Type.Optional(Type.String({ description: "Custom modifications for the item" }))
      }), { description: "Order items for ordering action" })),
      delivery: Type.Optional(Type.Object({
        address: Type.String({ description: "Delivery address" }),
        notes: Type.Optional(Type.String({ description: "Special delivery instructions" }))
      }, { description: "Delivery information for delivery orders" })),
      pickup: Type.Optional(Type.Object({
        name: Type.String({ description: "Pickup person's name" }),
        phone: Type.String({ description: "Pickup person's phone number" })
      }, { description: "Pickup information for pickup orders" })),
      orderId: Type.Optional(Type.String({ description: "Order ID for status checking or cancellation" })),
      latitude: Type.Optional(Type.Number({ description: "Latitude for store search" })),
      longitude: Type.Optional(Type.Number({ description: "Longitude for store search" })),
      radius: Type.Optional(Type.Number({ minimum: 1, maximum: 50, description: "Search radius in kilometers", default: 10 })),
      limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100, description: "Maximum number of results", default: 10 })),
      includeHours: Type.Optional(Type.Boolean({ description: "Include store hours in response", default: true })),
      includeFacilities: Type.Optional(Type.Boolean({ description: "Include store facilities in response", default: false })),
      includeRating: Type.Optional(Type.Boolean({ description: "Include store rating in response", default: false })),
      type: Type.Optional(Type.String({ description: "Store type filter" }))
    }),
    execute: async (_toolCallId, params) => {
      try {
        // Set default values for optional parameters
        const config = {
          radius: params.radius ?? 10,
          limit: params.limit ?? 10,
          includeHours: params.includeHours ?? true,
          includeFacilities: params.includeFacilities ?? false,
          includeRating: params.includeRating ?? false
        };

        let result: any;
        
        switch (params.action) {
          case "order":
            if (!params.items || params.items.length === 0) {
              throw new Error("Items are required for ordering");
            }
            
            // Use the existing mcp_order_mcdonalds for simple ordering
            if (params.delivery) {
              result = await mcp_order_mcdonalds({
                items: params.items.map(item => ({ id: item.id, quantity: item.quantity })),
                storeId: params.storeId || 'DEFAULT_STORE',
                delivery: params.delivery
              });
            } else {
              // For pickup orders, use the more comprehensive mcdonalds_mcp
              result = await mcdonalds_mcp({
                action: "order",
                storeId: params.storeId || 'DEFAULT_STORE',
                items: params.items,
                pickup: params.pickup || { name: "Customer", phone: "0000000000" },
                delivery: undefined
              });
            }
            break;
            
          case "get_stores":
            if (params.latitude === undefined || params.longitude === undefined) {
              throw new Error("Latitude and longitude are required for store search");
            }
            result = await mcdonalds_mcp({
              action: "get_stores",
              latitude: params.latitude,
              longitude: params.longitude,
              radius: config.radius,
              limit: config.limit,
              includeHours: config.includeHours,
              includeFacilities: config.includeFacilities,
              includeRating: config.includeRating,
              type: params.type
            });
            break;
            
          case "get_store_info":
            if (!params.storeId) {
              throw new Error("Store ID is required for getting store information");
            }
            result = await mcdonalds_mcp({
              action: "get_store_info",
              storeId: params.storeId,
              includeHours: config.includeHours,
              includeFacilities: config.includeFacilities,
              includeRating: config.includeRating
            });
            break;
            
          case "get_promotions":
            result = await mcdonalds_mcp({
              action: "get_promotions",
              storeId: params.storeId,
              limit: config.limit
            });
            break;
            
          case "check_order_status":
            if (!params.orderId) {
              throw new Error("Order ID is required for checking order status");
            }
            result = await mcdonalds_mcp({
              action: "check_order_status",
              orderId: params.orderId
            });
            break;
            
          case "cancel_order":
            if (!params.orderId) {
              throw new Error("Order ID is required for canceling order");
            }
            result = await mcdonalds_mcp({
              action: "cancel_order",
              orderId: params.orderId
            });
            break;
            
          default:
            throw new Error(`Unsupported action: ${params.action}`);
        }
        
        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
          details: { success: true, message: "Operation completed successfully", data: result }
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `Error: ${error.message}` }],
          details: { success: false, message: error.message }
        };
      }
    }
  };
}

export default createMCPClientRouterTool();
