# Hub

Hub is a server for making games in Devvit with less boilerplate and server interaction required.

- Automatic pub-sub per post
- Synchronized global timers
- Post creation boilerplate

Add the devvit-hub npm to your project, and then replace your main.ts with the code snippet below. Then you basically build your
entire app inside the webview!

```tsx
import { DefaultGameServer } from "devvit-hub";

const server = new DefaultGameServer("My Game");

// You can optionally subclass and override methods on GameServer for custom server functionality.  Look at the docs for more info.
server.onPostCreated = async ({ post_id }) => {
  await server.reddit.submitComment({
    id: post_id,
    text:
      `Welcome to My Game!\n\n` +
      `Here's some instructions on how to play...\n` +
      `Day phase: Next 20 minutes - Discuss and upvote comments to eliminate a suspected werewolf\n\n` +
      `New players can join at any time and will be assigned to help an existing team.\n` +
      `Use your team's ability wisely!\n\n` +
      `Good luck!`,
  });
};

export default server.build();
```
