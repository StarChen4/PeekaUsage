// 轮询调度由前端 composable（usePolling.ts）驱动。
// Rust 端不主动轮询，而是响应前端的 IPC 调用。
// 这个模块预留给将来需要后端主动推送时使用。
