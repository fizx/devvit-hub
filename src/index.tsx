// import "./capabilities/actions/index.js";

import { RedditObject } from "@devvit/protos";
import {
  BaseContext,
  ContextAPIClients,
  Devvit,
  JSONObject,
  JSONValue,
  Post,
  RedditAPIClient,
  RedisClient,
  useChannel,
  UseChannelResult,
  User,
  useState,
} from "@devvit/public-api";
import { RealtimeClient } from "@devvit/public-api/apis/realtime/RealtimeClient.js";
import { _activeRenderContext } from "@devvit/public-api/devvit/internals/blocks/handler/BlocksHandler.js";

export type PostInfo = {
  post_id: string;
};

export type UserInfo = {
  user_id: string;
};

export type Message = {
  from: UserInfo;
  channel: string;
  data: any;
};

export type Callbacks = {
  onPostCreated?: (post: Post) => Promise<void>;
};

export type Timer = {
  at: (elapsed: number, callback: Function) => Promise<void>;
};

export class DefaultGameServer {
  constructor(private name: string) {}

  async onPostCreated(post: PostInfo): Promise<any> {}

  async onWebviewMessage(msg: JSONValue): Promise<any> {
    if (this.context.postId) {
      await this.broadcast(this.context.postId, msg);
    }
  }
  async onReceiveBroadcasted(msg: Message): Promise<any> {
    await this.context.ui.webView.postMessage("webview1", msg);
  }
  async onPlayerJoined(
    post: PostInfo,
    user: UserInfo | undefined
  ): Promise<any> {
    this.broadcast(post.post_id, {
      joined: user ?? null,
    });
    await this.subscribePlayer(post.post_id);
  }
  async broadcast(channel: string, msg: JSONValue): Promise<any> {
    const rsp = await this.context.realtime.send(channel, {
      from: { user_id: this.context.userId ?? "logged_out" },
      msg,
    });
  }
  async subscribePlayer(channel: string): Promise<any> {
    const subsSet = new Set(this.subscriptions);
    subsSet.add(channel);
    this.setSubscriptions(Array.from(subsSet));
  }

  async unsubscribePlayer(channel: string): Promise<any> {
    const subsSet = new Set(this.subscriptions);
    subsSet.delete(channel);
    this.setSubscriptions(Array.from(subsSet));
  }

  async startTimer(name: string): Promise<Timer> {
    throw new Error("Not implemented");
  }

  get redis(): RedisClient {
    return this.context.redis;
  }

  get reddit(): RedditAPIClient {
    return this.context.reddit;
  }

  subscriptions: string[] = [];
  setSubscriptions: (subs: string[]) => void = () => {
    throw new Error("setSubscriptions not set");
  };

  context: BaseContext & ContextAPIClients = null as any;

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
          context.ui.navigateTo(`/r/${sr.name}/comments/${post.id}`);
          return context.ui.showToast("Post created, refresh to update.");
        } catch (e) {
          console.error(e);
          return context.ui.showToast("There was an error creating the post.");
        }
      }
    );

    const App: Devvit.CustomPostComponent = (context) => {
      that.context = context;
      console.log("state", _activeRenderContext?.request.state);

      const [subscriptions, setSubscriptions] = useState<string[]>([]);
      that.subscriptions = subscriptions;
      that.setSubscriptions = setSubscriptions;
      const postInfo = { post_id: context.postId! };

      const [userInfo] = useState<JSONObject>(async () => {
        const user = await context.reddit.getCurrentUser();
        const ui = user ? { user_id: user.id } : { user_id: "logged_out" };
        await that.onPlayerJoined(postInfo, ui);
        return ui;
      });

      console.log("Subscriptions", JSON.stringify(subscriptions));
      let channels: { [key: string]: UseChannelResult } = {};
      for (const sub of subscriptions) {
        channels[sub] = useChannel({
          name: sub,
          onMessage: (msg) => {
            that.onReceiveBroadcasted({
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
