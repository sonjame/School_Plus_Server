(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

import { app } from "./app";
import { env } from "./config/env";
import pushRoutes from "./routes/push";

app.use("/api", pushRoutes);

app.listen(env.PORT, () => {
  console.log(`[server] listening on :${env.PORT}`);
});
