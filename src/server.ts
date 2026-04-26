(BigInt.prototype as any).toJSON = function () {
    return this.toString();
};

import { app } from "./app";
import { env } from "./config/env";

app.listen(env.PORT, () => {
    console.log(`[server] listening on :${env.PORT}`);
});
