import { v4 } from "uuid";
import {
  BaseContext,
  ContextAPIClients,
  Devvit,
  JSONObject,
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
  post_id: string;
};

/**
 * This is a simplified version of a Reddit User.  You'll probably want to use the Reddit API Client to grab a more
 * complete one.
 */
export type UserInfo = {
  user_id: string;
  username: string;

  /** This is a unique id for the specific app on the other end.  If they refresh, it would be a different one. */
  screen_id: string;
};

export type BroadcastMessage = {
  from: UserInfo;

  /** Typically this is the post_id, but you can create your own channels. */
  channel: string;

  /** The raw data of the message. */
  data: any;
};

export type Timer = {
  at: (elapsed: number, callback: Function) => Promise<void>;
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
   * By default, this method will broadcast the message to the post_id channel.  You can override this method to
   * customize the behavior.
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
    await this.context.ui.webView.postMessage("webview1", msg);
  }

  /**
   * A player has joined the game.  By default, this will
   *
   * 1. broadcast a notification to the post_id channel, and
   * 2. subscribe the player to the post_id channel.
   */
  async onPlayerJoined(): Promise<any> {
    await this.subscribePlayer(this.context.postId!);
    await this.broadcast(this.context.postId!, { joined: true });
  }
  /**
   * You can use this method to broadcast a message to all of your players.
   *
   * @param channel
   * @param msg
   */
  async broadcast(channel: string, msg: JSONValue): Promise<any> {
    const rsp = await this.context.realtime.send(channel, {
      from: { user_id: this.context.userId ?? "logged_out" },
      msg,
    });
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
   * This unsubscribes the current player from a channel.
   * @param channel
   */
  async unsubscribePlayer(channel: string): Promise<any> {
    const subsSet = new Set(this.subscriptions);
    subsSet.delete(channel);
    this.setSubscriptions(Array.from(subsSet));
  }

  async startTimer(name: string): Promise<Timer> {
    throw new Error("Not implemented");
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

  userInfo: UserInfo = {
    user_id: "logged_out",
    username: "Anonymous",
    screen_id: "",
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
          await this.onPostCreated({ post_id: post.id });
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
      const postInfo = { post_id: context.postId! };

      const [ui] = useState<UserInfo>(async () => {
        const user = await context.reddit.getCurrentUser();
        return user
          ? {
              user_id: user.id,
              username: user.username,
              screen_id: v4(),
            }
          : {
              user_id: "logged_out",
              username: "Anonymous",
              screen_id: v4(),
            };
      });
      that.userInfo = ui;

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
