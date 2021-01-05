# CVH-Camera

The CVH-Camera project provides a way to share one or multiple camera views using the Janus WebRTC gateway. It is designed to be used with the PULT project available at [https://gitlab.cvh-server.de/pgerwinski/pult](https://gitlab.cvh-server.de/pgerwinski/pult).

Note that the project and its documentation are still in development.

In this documentation clients that publish a feed will be referred to as *senders* and clients who receive a feed will be referred to as *receivers* or *viewers*.

# Camera Server

CVH-Camera uses a Nodejs server with the socket.io library to send events regarding the camera feeds out to the receivers in realtime. The socket connection is also used to verify feeds that are published in the Janus rooms and only send those to the receivers. This way no unwanted feeds can be shown to the receivers while still having a public password for the Janus room itself.

One instance of the camera server is meant to manage one Janus room. It does this by defining slots for cameras which are all disabled by default. To activate a slot, one has to provide a token for that slot. This token will be required to be able to send a feed on that slot. As mentioned above, only feeds that are verified in that way are shown to the receivers.
One can also refresh the token for a given slot or simply deactivate it.

## Compiling and Running the Server

The camera server is written in typescript, a superset of javascript. That means that is has to be compiled before being able to start.
To compile the code, install all dependencies, including the typescript compiler.
This can be done by running `npm install` in the `camera-server` folder.
Then run `npm run build` in the same folder. This will compile the files into a newly created folder `dist`.

Once the code is compiled, the server can be started with `node server.js` in the `dist` folder.

## Config

The camera server can read a path to a config file from the `CONFIG_PATH` environment variable.
This config file has to be in the json format and should have [this structure](./camera-server/example-config.json).

Below is a description of the config file's properties:

* `port`: The port on which the server will listen. Defaults to `5000`.

* `cameraSlots`: The camera slots available for this room. Defaults to `4`.

## Stdin-Interface

The camera server is controlled by PULT via its stdin. One could also implement the interface in any other program to manage the CVH-Camera.

For the syntax of the commands the following convention is used in this documentation:

* `<param>` is a parameter that is required.

* `<a | b>` is a parameter that is required and has to hold either the value `a` or `b`.

* `[param]` is a parameter that is optional

This is the list of the available commands:

### Slot Control Commands

| Command                           | Description
| --------------------------------- | -----------
| `activate_slot`                   | Activates a slot and sets its token. To set a new token use `refresh_token`. <br/><br/> **Usage**: `activate_slot <slot> <token>`
| `refresh_token`                   | Sets a new token for a slot. <br/><br/> **Usage**: `refresh_token <slot> <new_token>`
| `deactivate_slot`                 | Deactivates a slot. Also ensures that the feed is removed for the receivers. <br/><br/> **Usage**: `deactivate_slot <slot>`

### Camera Control Commands

These commands are designed to work well with the PULT project and thus with noVNC, a VNC web client.

The current state of the camera feeds is saved in the server's memory and will be applied to new viewers.

| Command                           | Description
| --------------------------------- | -----------
| `set_geometry_relative_to_canvas` | Sets the geometry of the feed on the slot relative to the noVNC canvas. <br/> Note that the pixel values should be provided relative to those of the transmitted VNC feed, not those of the canvas or window. This might change the absolute size of the camera feed depending on the screen size of the viewer. <br/><br/> **Usage**: `set_geometry_relative_to_canvas <slot> <l \| r><t \| b> <x_offset> <y_offset> <width> <height> [z-index]`. <br/><br/> The positioning is handled like the CSS position attribute. In case you are not familiar with it: l stand for left, r for right, t for top and b for bottom. The x and y offset is then relative to the provided sides. For example the position `rt 21 42` will position the camera feed with a 21px space to the right side and a 42px space to the top side of the canvas. <br/> The z-index defines how the camera feeds are layered, when they overlap. To make sure no undefined behavior occurs, one should make sure that every feed has a different z-index when overlapping the feeds.
| `set_geometry_relative_to_window` | Sets the geometry of the feed on the slot relative to the window of the viewer. <br/> Note that this can cause unwanted behavior. The feeds might look positioned well on your screen, but poorly positioned on a screen with a different size. `set_geometry_relative_to_canvas` should be used in most cases, because its pixel values are relative to the size of the transmitted VNC feed. <br/><br/> **Usage**: `set_geometry_relative_to_window <slot> <l \| r><t \| b> <x_offset> <y_offset> <width> <height> [z-index]`. <br/><br/> The parameters work the same way as described in the description of `set_geometry_relative_to_canvas`.
| `hide`                            | Hides the feed of the provided slot. <br/> Note that the feed will still be transmitted to the viewer but is just hidden. By doing that, the feed can be shown again with a very low latency. <br/><br/> **Usage**: `hide <slot>`
| `show`                            | Shows the feed of the provided slot in case it was hidden. <br/><br/> **Usage**: `show <slot>`

## Socket Traffic

This section describes the socket traffic and the socket.io events that are used.

### Sender

When the sender side expects an answer to a request, a callback can be passed to the emit function. The server can then take that function as a parameter of the handler and call it with the response. Below you can see an abstract example of the described technique.

```javascript
// Client
socket.emit('sender_init', 'Some data', function(responseData) {
    console.log(responseData); // Should log 'Some answer'
});

// Server
socket.on('sender_init', function(data, fn) {
    console.log(data); // Should log 'Some data'
    fn('Some answer');
});
```

Server responses to request will always include the following fields:

* `success`: A boolean that indicates, whether the request was successful or not.

* `message`: A string that holds a user-friendly text to display. Holds the message of the error if one occurred.

In order to authenticate itself, the sender has to provide a slot and a token by emitting a `sender_init` event. These values are provided through the query string of the sender web page. When the server receives the `sender_init` event it validates the slot and the token and sends a response.

After a successful initialisation the connectin to janus is established. When the camera is shared, the id of the transmitted Janus feed is determined and then sent to the server using the `set_feed_id` event. On the server the corresponding slot will save that feed id. This will then be used to tell all receivers which feed id to attach to.

When the sender socket disconnects, an event will be emitted, notifying the receivers to remove the corresponding feed.
