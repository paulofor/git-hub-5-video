import { createApp } from './server.js';

const port = Number.parseInt(process.env.PORT ?? '8083', 10);
const app = createApp();

app.listen(port, () => {
  console.log(`Sandbox orchestrator listening on port ${port}`);
});
