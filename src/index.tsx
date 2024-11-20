import { v4 } from "uuid";
import {
  BaseContext,
  ContextAPIClients,
  Devvit,
  JSONValue,
  RedditAPIClient,
  RedisClient,
  useChannel,
  UseChannelResult,
  useState,
} from "@devvit/public-api";

/**
 * This is a simplified version of a Reddit Post.  You'll probably want to use the Reddit API Client to grab a more
 * complete one.
 */
export type PostInfo = {
  postId: string;
};

/**
 * This is a simplified version of a Reddit User.  You'll probably want to use the Reddit API Client to grab a more
 * complete one.
 */
export type UserInfo = {
  userId: string;
  username: string;

  /** This is a unique id for the specific app on the other end.  If they refresh, it would be a different one. */
  screenId: string;
};

export type TimerEvent = {
  postId: string;
  name: string;
  id: string;
  interval?: number;
  data?: JSONValue;
};

export type BroadcastMessage = {
  from: UserInfo;

  /** Typically this is the postId, but you can create your own channels. */
  channel: string;

  /** The raw data of the message. */
  data: any;
};

/**
 * This is a basic game server that can be used to create a simple game.  Many of the methods are overridable so you can
 * customize the behavior of the game server.  Look at the specific method documentation for more information.
 */
export class BasicGameServer {
  /**
   * @param name The name of the game.  This is used to create the menu item to create a post.
   */
  constructor(private name: string) {}

  /**
   * This method is called when a new post is created.  You can use this to initialize the game state.
   *
   * @param post The post that was created.
   */
  async onPostCreated(post: PostInfo): Promise<any> {}

  /**
   * This method is called when a message is received from the webview.  You can use this to update the game state. By default,
   * this method will broadcast the message to the postId channel.  You can override this method to customize the behavior.
   *
   * @param msg The message that was sent from the webview.
   */
  async onWebviewMessage(msg: JSONValue): Promise<any> {
    if (this.context.postId) {
      await this.broadcast(this.context.postId, msg);
    }
  }

  /**
   * This method is called when a message is received from the broadcast channel.  By default, this will send the
   * message to the webview.  You can override this method to customize the behavior.
   *
   * @param msg The message that was received from the broadcast channel.
   */
  async onReceive(msg: BroadcastMessage): Promise<any> {
    this.sendToCurrentPlayerWebview(msg);
  }

  /**
   * A player has joined the game.  By default, this will
   *
   * 1. broadcast a notification to the postId channel, and
   * 2. subscribe the player to the postId channel.
   */
  async onPlayerJoined(): Promise<any> {
    await this.subscribePlayer(this.context.postId!);
    await this.broadcast(this.context.postId!, { joined: this.userInfo });
    await this.sendToCurrentPlayerWebview({ ready: this.userInfo });
  }
  /**
   * You can use this method to broadcast a message to all of your players.
   *
   * @param channel
   * @param msg
   */
  async broadcast(channel: string, msg: JSONValue): Promise<any> {
    const rsp = await this.context.realtime.send(channel, {
      from: this.userInfo,
      msg,
    });
  }

  /**
   * Assuming you're in an individual user's context, you can use this method to send a message to the webview.  If you're in
   * a more global context, like a timer event, there won't be a webview to send a message to, so this will do nothing.
   *
   * @param msg The message to send to the webview.  This should be a JSONable object.
   * @returns
   */
  async sendToCurrentPlayerWebview(msg: JSONValue): Promise<any> {
    if (!this.context.ui.webView) {
      console.error("No webview to send message to");
      return;
    }
    await this.context.ui.webView.postMessage("webview1", msg);
  }

  /**
   * This subscribes the current player to a channel.
   *
   * @param channel
   */
  async subscribePlayer(channel: string): Promise<any> {
    const subsSet = new Set(this.subscriptions);
    subsSet.add(channel);
    this.setSubscriptions(Array.from(subsSet));
  }

  /**
   * This gets called whenever a timer event is triggered.  You can use this to update the game state, broadcast
   * changes, etc.  By default, this method broadcasts the timer event to the postId channel.
   */
  async onTimerEvent(t: TimerEvent) {
    await this.broadcast(t.postId, {
      timer: t,
    });
  }

  /**
   * This unsubscribes the current player from a channel.
   * @param channel
   */
  async unsubscribePlayer(channel: string): Promise<any> {
    const subsSet = new Set(this.subscriptions);
    subsSet.delete(channel);
    this.setSubscriptions(Array.from(subsSet));
  }

  /**
   * Cancels a scheduled timer event
   * @param t The timer event to cancel
   */
  async cancel(t: TimerEvent) {
    await this.context.redis.zRem("timeouts", [JSON.stringify(t)]);
  }

  /**
   * Schedules a one-time timer event.  You should prefer this to naive setTimeout, if you want a long-running timer.
   * This method will handle server restarts and other issues that could cause a naive setTimeout to drift or stop.
   *
   * @param name - Unique identifier for the timer, used for cancellation
   * @param millis - Delay in milliseconds before the timer fires
   * @param data - Optional data to pass to the timer event
   * @returns A TimerEvent object representing the scheduled timer
   * @throws Error if no postId is present in the context
   */
  async setTimeout(
    name: string,
    millis: number,
    data?: JSONValue
  ): Promise<TimerEvent> {
    if (!this.context.postId) {
      throw new Error("No postId in context");
    }
    const event = {
      postId: this.context.postId,
      name,
      id: v4(),
      data,
    };
    await this.context.redis.zAdd("timeouts", {
      score: Date.now() + millis,
      member: JSON.stringify(event),
    });

    return event;
  }

  /**
   * Schedules a recurring timer event on the server.  You should prefer this to naive setInterval, if you want a long-running
   * interval.  This method will handle server restarts and other issues that could cause a naive setInterval to drift or stop.
   *
   * @param name - Unique identifier for the timer, used for cancellation
   * @param millis - Interval in milliseconds between timer events
   * @param data - Optional data to pass to the timer event
   * @returns A TimerEvent object representing the scheduled timer
   * @throws Error if no postId is present in the context
   */
  async setInterval(
    name: string,
    millis: number,
    data?: JSONValue
  ): Promise<TimerEvent> {
    if (!this.context.postId) {
      throw new Error("No postId in context");
    }
    const event = {
      postId: this.context.postId,
      name,
      id: v4(),
      interval: millis,
      data,
    };
    await this.context.redis.zAdd("timeouts", {
      score: Date.now() + millis,
      member: JSON.stringify(event),
    });

    return event;
  }

  /**
   * @internal
   *
   * Internal method to process and fire scheduled timer events
   * @param context - Base context containing Redis connection and other required data
   *
   */
  async _fireTimers(context: BaseContext) {
    console.log("Firing timers at " + new Date().toISOString());
    this.context = context as any;
    const now = Date.now();

    try {
      // Get expired timers but don't remove them yet
      const expired = await this.context.redis.zRange("timeouts", 0, now, {
        by: "score",
      });

      if (expired.length === 0) return;

      // Process each timer individually
      for (const entry of expired) {
        try {
          const timer = JSON.parse(entry.member) as TimerEvent;

          // Process the timer first
          this.context.postId = timer.postId;
          console.log("Firing timer", timer);
          await this.onTimerEvent(timer);

          // Only after successful processing:
          // 1. Remove the original timer
          // 2. Add the next interval if needed
          await this.context.redis.zRem("timeouts", [entry.member]);

          if (timer.interval) {
            await this.context.redis.zAdd("timeouts", {
              score: now + timer.interval,
              member: entry.member,
            });
          }
        } catch (error) {
          console.error(
            `Failed to process timer entry ${entry.member}:`,
            error
          );
          // Skip this timer - it will be retried on next iteration
        }
      }
    } catch (error) {
      console.error("Error in _fireTimers:", error);
    }
  }

  /**
   * This is a helper method to get the Redis client.  All of your game state should be stored in Redis.
   */
  get redis(): RedisClient {
    return this.context.redis;
  }

  /**
   * This is a helper method to get the Reddit API client.  You can use this to interact with Reddit.
   */
  get reddit(): RedditAPIClient {
    return this.context.reddit;
  }

  /**
   * This is a helper method to get the current user id.  This will be null if the user is not logged in, or if
   * this is a TimerEvent handler.
   */
  get userId(): string | null {
    return this.userInfo.userId === "logged_out" ? null : this.userInfo.userId;
  }

  /**
   * This is a helper method to get the current post id.
   */
  get postId(): string {
    return this.context?.postId!;
  }

  /**
   * This is a helper method to get the current user info.
   */
  get userInfo(): UserInfo {
    return this._userInfo;
  }

  /**
   * @internal
   */
  subscriptions: string[] = [];

  /**
   * @internal
   */
  setSubscriptions: (subs: string[]) => void = () => {
    throw new Error("setSubscriptions not set");
  };

  /**
   * @internal
   */
  context: BaseContext & ContextAPIClients = null as any;

  /**
   * @internal
   */
  _userInfo: UserInfo = {
    userId: "logged_out",
    username: "Anonymous",
    screenId: "",
  };

  /**
   * This must be called to build the game server.  This will add the game server to the Devvit instance.
   *
   * @returns The Devvit instance with the game server added.
   */
  build(): typeof Devvit {
    const that = this;
    Devvit.configure({
      redditAPI: true,
      redis: true,
      realtime: true,
    });

    Devvit.addSchedulerJob({
      name: "timers",
      onRun: async (event, context) => {
        console.log("Firing timers at " + new Date().toISOString());
        await that._fireTimers(context);
      },
    });

    const postForm = Devvit.createForm(
      {
        fields: [
          {
            name: "title",
            label: `Post Title`,
            type: "string",
            required: true,
          },
        ],
        title: "Post Form",
        acceptLabel: "Post",
      },
      async ({ values }, context) => {
        that.context = context;
        try {
          if (!context.userId)
            return context.ui.showToast(
              "Unable to post anonymously unless you're logged in."
            );
          let sr = await context.reddit.getSubredditById(context.subredditId);
          let post = await context.reddit.submitPost({
            subredditName: sr.name,
            title: values["title"],
            preview: (
              <webview
                id="webview1"
                url="index.html"
                width="100%"
                height="100%"
              />
            ),
          });
          that.context.postId = post.id;
          const jobs = await context.scheduler.listJobs();
          for (const job of jobs) {
            await context.scheduler.cancelJob(job.id);
          }
          await context.scheduler.runJob({
            cron: "* * * * *",
            name: "timers",
            data: {},
          });
          await this.onPostCreated({ postId: post.id });
          context.ui.navigateTo(
            `https://www.reddit.com/r/${sr.name}/comments/${post.id}`
          );
          return context.ui.showToast("Post created, refresh to update.");
        } catch (e) {
          console.error(e);
          return context.ui.showToast("There was an error creating the post.");
        }
      }
    );

    const App: Devvit.CustomPostComponent = (context) => {
      that.context = context;

      const [subscriptions, setSubscriptions] = useState<string[]>([]);
      that.subscriptions = subscriptions;
      that.setSubscriptions = setSubscriptions;
      const postInfo = { postId: context.postId! };

      const [ui] = useState<UserInfo>(async () => {
        console.log("Getting user info");
        const user = await context.reddit.getCurrentUser();
        that._userInfo = user
          ? {
              userId: user.id,
              username: user.username,
              screenId: v4(),
            }
          : {
              userId: "logged_out",
              username: "Anonymous",
              screenId: v4(),
            };
        await that.onPlayerJoined();
        return that.userInfo;
      });
      that._userInfo = ui;

      console.log("Subscriptions", JSON.stringify(subscriptions));
      let channels: { [key: string]: UseChannelResult } = {};
      for (const sub of subscriptions) {
        channels[sub] = useChannel({
          name: sub,
          onMessage: (msg) => {
            that.onReceive({
              channel: sub,
              from: (msg as any).from,
              data: (msg as any).msg,
            });
          },
        });
        channels[sub].subscribe();
      }

      async function dispatchMessage(msg: JSONValue) {
        console.log("Received message", msg);
        const rsp = await that.onWebviewMessage(msg);
        console.log("after should be after", rsp);
        if (rsp) {
          console.log("posting message", rsp);
          await context.ui.webView.postMessage("webview1", rsp);
        }
      }
      return (
        <webview
          id="webview1"
          url="index.html"
          width="100%"
          height="100%"
          onMessage={dispatchMessage}
        />
      );
    };

    Devvit.addCustomPostType({
      name: "Hello World",
      height: "regular",
      render: App,
    });

    Devvit.addMenuItem({
      label: `Create a ${this.name} Post`,
      location: "subreddit",
      onPress: (event, context) => {
        return context.ui.showForm(postForm);
      },
    });
    return Devvit;
  }
}
