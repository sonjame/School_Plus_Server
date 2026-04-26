import "dotenv/config";
import { app } from "./src/app";
import { prisma } from "./src/db/prisma";
import http from "http";
import jwt from "jsonwebtoken";

const PORT = 4001;
let server: http.Server;

async function main() {
    console.log("Starting verification...");

    // Start server
    await new Promise<void>((resolve) => {
        server = app.listen(PORT, () => {
            console.log(`Test server running on ${PORT}`);
            resolve();
        });
    });

    const baseUrl = `http://localhost:${PORT}`;
    const testEmail = "verify@test.com";
    const testUsername = "verify_user";

    try {
        // 1. Clean up test user
        await prisma.users.deleteMany({ where: { username: testUsername } });

        // 2. Create Kakao user manually (simulating OAuth creation)
        const user = await prisma.users.create({
            data: {
                username: testUsername,
                password: "password123!", // Dummy password
                name: "Test User",
                school: "Test School",
                school_code: "123",
                edu_code: "456",
                grade: "1",
                email: testEmail,
                provider: "kakao"
            }
        });
        console.log("Created test Kakao user:", user.id);

        // 3. Test /password/request for Kakao
        console.log("Testing POST /auth/password/request (Kakao)...");
        const reqBody = { username: testUsername, email: testEmail, provider: "kakao" };
        const res = await fetch(`${baseUrl}/auth/password/request`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(reqBody)
        });

        const json = await res.json();
        console.log("Response:", JSON.stringify(json, null, 2));

        if (!json.ok || !json.reset_token) {
            throw new Error("Failed to get reset token for Kakao user");
        }

        // 4. Verify DB token
        const resetRow = await prisma.password_resets.findFirst({
            where: { user_id: user.id }
        });
        if (!resetRow) throw new Error("No reset token found in DB");
        console.log("Found reset token in DB");

        // 5. Test GET /auth/me
        console.log("Testing GET /auth/me...");
        if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET missing");

        const token = jwt.sign({ userId: user.id.toString() }, process.env.JWT_SECRET, { expiresIn: "1h" });

        const meRes = await fetch(`${baseUrl}/auth/me`, {
            headers: { "Authorization": `Bearer ${token}` }
        });
        const meJson = await meRes.json();
        console.log("Response:", JSON.stringify(meJson, null, 2));

        if (!meJson.ok || meJson.user.username !== testUsername) {
            throw new Error("/me failed or returned wrong user");
        }

        console.log("✅ Verification SUCCESS!");

    } catch (e) {
        console.error("❌ Verification FAILED:", e);
        process.exit(1);
    } finally {
        // Cleanup
        await prisma.users.deleteMany({ where: { username: testUsername } });
        server.close();
        await prisma.$disconnect();
        process.exit(0);
    }
}

main();
