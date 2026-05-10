import { Expo, ExpoPushMessage } from "expo-server-sdk";

const expo = new Expo();

type SendPushParams = {
  expoPushToken: string;
  title: string;
  body: string;
  data?: Record<string, any>;
};

export async function sendPushNotification({
  expoPushToken,
  title,
  body,
  data = {},
}: SendPushParams) {
  try {
    if (!Expo.isExpoPushToken(expoPushToken)) {
      console.error("잘못된 Expo Push Token:", expoPushToken);
      return;
    }

    const messages: ExpoPushMessage[] = [
      {
        to: expoPushToken,
        sound: "default",
        title,
        body,
        data,
        priority: "high",
      },
    ];

    const chunks = expo.chunkPushNotifications(messages);

    for (const chunk of chunks) {
      await expo.sendPushNotificationsAsync(chunk);
    }
  } catch (error) {
    console.error("푸시 전송 실패:", error);
  }
}
