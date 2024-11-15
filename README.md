# Hub

Hub is a server for making games in Devvit with less boilerplate and server interaction required.

- Automatic pub-sub per post
- Synchronized global timers
- Post creation boilerplate

Add the devvit-hub npm to your project, and then replace your main.ts with the code snippet below. Then you basically build your
entire app inside the webview, where window.postMessage will automatically be wired up!

```tsx
import { BasicGameServer } from "devvit-hub";

const server = new BasicGameServer("My Game");

// You can optionally subclass and override methods on GameServer for custom server functionality.  Look at the docs for more info.
server.onPostCreated = async ({ postId }) => {
  await server.reddit.submitComment({
    id: postId,
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

Check out https://fizx.github.io/devvit-hub for documentation.

There's a very simple example app at https://github.com/fizx/chatty
