# Tools (Logos-native)

All tools operate through the Logos kernel via 5 primitives.

## logos_read
Read any logos:// URI or relative file path.
- Files: `logos_read({uri: "src/main.py"})`
- System: `logos_read({uri: "logos://system/tasks"})`
- Memory: `logos_read({uri: "logos://memory/groups/{gid}/messages/{id}"})`

## logos_write
Write to any logos:// URI or relative file path.
- Files: `logos_write({uri: "hello.py", content: "print('hi')"})`
- Memory: `logos_write({uri: "logos://memory/groups/{gid}/messages", content: "..."})`

## logos_exec
Run a shell command in the sandbox container.
- `logos_exec({command: "ls -la"})`
- `logos_exec({command: "python3 script.py"})`

## logos_call
Call a kernel proc tool.
- `logos_call({tool: "system.complete", params: {summary: "...", reply: "..."}})`
- `logos_call({tool: "system.search_tasks", params: {query: "error message"}})`
- `logos_call({tool: "memory.search", params: {chat_id: "...", query: "..."}})`

## logos_patch
JSON deep merge at any logos:// URI.
- `logos_patch({uri: "logos://users/{uid}/profile.json", partial: "{\"role\": \"dev\"}"})`

## logos_deploy_service
Deploy a persistent service to the Logos kernel.
- Writes compose.yaml + artifacts to svc-store, registers in services registry.

## fetch_webpage
Fetch and return the content of a web page.
