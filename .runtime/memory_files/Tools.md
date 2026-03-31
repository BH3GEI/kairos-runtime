# Tools

## logos_read
```ts
logos_read(): string
```

- description: Read from any logos:// URI or relative path (auto-scoped to your sandbox).
- parameters:

## logos_write
```ts
logos_write(): string
```

- description: Write to any logos:// URI or relative path.
- parameters:

## logos_exec
```ts
logos_exec(): string
```

- description: Run a shell command in the sandbox container.
- parameters:

## logos_call
```ts
logos_call(): string
```

- description: Call a logos proc tool (system.complete, system.search_tasks, memory.search, etc.).
- parameters:

## logos_patch
```ts
logos_patch(): string
```

- description: JSON deep merge at any logos:// URI.
- parameters:

## logos_deploy_service
```ts
logos_deploy_service(): string
```

- description: Deploy a service to logos. Writes compose.yaml + artifacts to svc-store, then registers in services. The service persists across restarts.
- parameters:

## fetch_webpage
```ts
fetch_webpage(url: string): string
```

- description: Fetch webpage content through r.jina.ai by passing a normal URL.
- parameters:
  - url (string, required) - Target webpage URL, e.g. https://example.com/page

## mod_pow
```ts
mod_pow(base: string, exponent: string, modulus: string): string
```

- description: 计算大数模幂 a^b mod m
- parameters:
  - base (string, required) - 底数
  - exponent (string, required) - 指数
  - modulus (string, required) - 模数

## mod_exp
```ts
mod_exp(base: string, exponent: string, modulus: string): string
```

- description: 计算大数的模幂运算 (base^exponent) mod modulus
- parameters:
  - base (string, required) - 底数
  - exponent (string, required) - 指数
  - modulus (string, required) - 模数

## get_weather
```ts
get_weather(city: string): string
```

- description: 获取指定城市的当前天气信息
- parameters:
  - city (string, required) - 城市名称，例如：天津、北京、上海

## high_precision_multiply
```ts
high_precision_multiply(a: string, b: string): string
```

- description: 计算两个任意精度数字的乘积 a * b，支持整数和小数
- parameters:
  - a (string, required) - 第一个乘数（数字字符串）
  - b (string, required) - 第二个乘数（数字字符串）
