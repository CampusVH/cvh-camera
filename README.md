# CVH-Camera

The CVH-Camera project provides a way to share one or multiple camera views using the Janus WebRTC gateway. It is designed to be used with the PULT project available at [https://gitlab.cvh-server.de/pgerwinski/pult](https://gitlab.cvh-server.de/pgerwinski/pult).

Note that the project and its documentation are still in development.

In this documentation clients that publish a feed will be referred to as *senders* and clients who receive a feed will be referred to as *receivers* or *viewers*.

# Sender Web Page

CVH-Camera provides a web page with which users can transmit camera feeds.

## Query Parameters

The behavior of the sender page can be controlled using its query parameters.

Providing query parameters can be done by appending a question mark to the url, followed by key-value pairs which are divided by and symbols.
Example: `http://www.mywebpage.com/somePage.html?param1=value1&param2=value2`. In the example the parameters `param1` and `param2` are provided
with the values `value1` and `value2`.

The following list explains the usage of the parameters:

* `room`: The number of the Janus room. Defaults to `1000`.

* `slot`: The camera slot used in the room. Defaults to `0`.

* `token`: The token required for authentication on the camera server (see below). Defaults to an empty string, which will yield to the user not being able to transmit his camera feed.

* `pin` *optional*: The pin for the Janus room. If the Janus room has no pin, provide the value `none`. If this parameter is not provided, an input field for the pin is shown.

* `customNameAllowed` *optional*: If this parameter is present (even when holding no value), an input field for a custom name is shown. If a value is provided for this field, it will be used as initial value of the input field. The user can also update his name after starting a transmission. The names are escaped on the server to prevent Cross-Site-Scripting (XSS) attacks.

# Camera Server

CVH-Camera uses a Nodejs server with the socket.io library to send events regarding the camera feeds out to the receivers in realtime. The socket connection is also used to verify feeds that are published in the Janus rooms and only send those to the receivers. This way no unwanted feeds can be shown to the receivers while still having a public password for the Janus room itself.

One instance of the camera server is meant to manage one Janus room.
This is done by creating a new Janus room on startup and destroying it on shutdown of the server.

The room is managed by defining slots for cameras which are all disabled by default. To activate a slot, one has to provide a token for that slot. This token will be required to be able to send a feed on that slot. As mentioned above, only feeds that are verified in that way are shown to the receivers.
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

* `notifyPath`: A path to a file which the camera server will append messages to.
  This is used to notify the controller (usually PULT).
  The path can either be absolute or relative to the config file but must not start with a tilde.

  If this property is emitted or an empty string is provided, the notify feature will not be used.

* `janusURL`: The url of the janus server. Defaults to `http://localhost:8088/janus`.
  Note that by default `/janus` has to be appended to the url.

  **Important**: If you disabled http and only have https enabled for the Janus API, use the url that the
  sender and noVNC site would use to connect to the Janus API. Example: `https://mydomain.com:8089/janus`.
  Simply providing `https://localhost:8089/janus` would not work because the domain name
  of the SSL certificate would not match.

* `janusRoom`: The janus room which will be used. Make sure that the room is unique
  and not used for anything else, as the server will destroy it on startup to create
  a new room. Defaults to `1000`.

* `janusRoomSecret`: The secret used by the janus room. This is required to make
  severe request regarding the room like destroying it. Make sure that this is a long
  arbitrary string. Defaults to `default`.

* `janusRoomPin`: The pin required to join the room as a viewer or sender. Defaults to
  no pin (empty string).

* `janusBitrate`: The default bitrate with which a camera feed is transmitted by Janus.
  Defaults to `128000`.

* `janusAdminKey`: Admin key for the Janus API, which is required to create new rooms.
  It is recommended to use this feature becuase it reduces attack possibilities.
  Defaults to an empty string.

  **Important**: This key needs to match the admin key in the config file for the
  Janus videoroom plugin. In the used development environment it is located at
  `/opt/janus/etc/janus/janus.plugin.videoroom.jcfg`. The admin key can be set
  in the `general: { ... }` block of the janus config using the `admin_key` directive.

  Example:
  ```
  general: {
    admin_key = "MySafeAdminKey"
  }
  ```

## Stdin-Interface

The camera server is controlled by PULT via its stdin. One could also implement the interface in any other program to manage the CVH-Camera.

For the syntax of the commands the following convention is used in this documentation:

* `<param>` is a parameter that is required.

* `<a | b>` is a parameter that is required and has to hold either the value `a` or `b`.

* `[param]` is a parameter that is optional.

This is the list of the available commands:

### Room Control Commands

| Command                           | Description
| --------------------------------- | -----------
| `edit_pin`                        | Changes the pin of the Janus room. This pin is required to join the room as a viewer or sender. Note that this does not automatically kick the current participants of the Janus room. The noVNC pin also needs to be changed accordingly as it is expected to equal the Janus room pin. <br/><br/> **Usage**: `edit_pin <pin>`

### Slot Control Commands

| Command                           | Description
| --------------------------------- | -----------
| `activate_slot`                   | Activates a slot and sets its token. To set a new token use `refresh_token`. <br/><br/> **Usage**: `activate_slot <slot> <token> [annotation]` <br/><br/> See `set_annotation` for an explanation of the annotation.
| `refresh_token`                   | Sets a new token for a slot. <br/><br/> **Usage**: `refresh_token <slot> <new_token>`
| `deactivate_slot`                 | Deactivates a slot. Also ensures that the feed is removed for the receivers. <br/><br/> **Usage**: `deactivate_slot <slot>`
| `set_annotation`                  | Sets the annotation of a slot. A simple use case would be displaying the user's name below his feed. <br/><br/> **Usage**: `set_annotation <slot> <annotation>` <br/><br/> `annotation` can be any HTML snippet which will annotate the camera feed of the slot. This is done by appending the snippet to the container which contains the video element of the feed. <br/> If this example snippet is provided, the text *Hello noVNC* will be displayed at the bottom of the feed container: `<div style="box-sizing: border-box; position: absolute; bottom: 0; width: 100%; background: rgba(0, 0, 0, 0.75); color: white; text-align: center; padding: 4px;">Hello noVNC</div>`. <br/><br/> **Important**: The HTML snippet has to have only one parent element. The container uses the CSS declaration `position: fixed`. Thus, working with `position: absolute` is possible and definitely advised. 
| `remove_annotation`               | Removes the annotation of a slot. <br/><br/> **Usage**: `remove_annotation <slot>`
| `set_bitrate_limit`               | Sets the bitrate limit for the camera feed transmission of the provided slot. This can be useful to save traffic when the camera feed is only displayed relatively small on the receiver side. Setting a limit of 0 removes the limit. Note that the initial controller bitrate will be equal to the one mentioned in the config file. When deactivating a slot, the controller bitrate is set to its initial value. <br/><br/> **Usage**: `set_bitrate_limit <slot> <bitrate>`

### Camera Control Commands

These commands are designed to work well with the PULT project and thus with noVNC, a VNC web client.

The current state of the camera feeds is saved in the server's memory and will be applied to new viewers.

| Command                           | Description
| --------------------------------- | -----------
| `set_geometry_relative_to_canvas` | Sets the geometry of the feed on the slot relative to the noVNC canvas. <br/> Note that the pixel values should be provided relative to those of the transmitted VNC feed, not those of the canvas or window. This might change the absolute size of the camera feed depending on the screen size of the viewer. <br/><br/> **Usage**: `set_geometry_relative_to_canvas <slot> <l \| r><t \| b> <x_offset> <y_offset> <width> <height> [z-index]`. <br/><br/> The positioning is handled like the CSS position attribute. In case you are not familiar with it: l stand for left, r for right, t for top and b for bottom. The x and y offset is then relative to the provided sides. For example the position `rt 21 42` will position the camera feed with a 21px space to the right side and a 42px space to the top side of the canvas. <br/> The z-index defines how the camera feeds are layered, when they overlap. To make sure no undefined behavior occurs, one should make sure that every feed has a different z-index when overlapping the feeds.
| `set_geometry_relative_to_window` | Sets the geometry of the feed on the slot relative to the window of the viewer. <br/> Note that this can cause unwanted behavior. The feeds might look positioned well on your screen, but poorly positioned on a screen with a different size. `set_geometry_relative_to_canvas` should be used in most cases, because its pixel values are relative to the size of the transmitted VNC feed. <br/><br/> **Usage**: `set_geometry_relative_to_window <slot> <l \| r><t \| b> <x_offset> <y_offset> <width> <height> [z-index]`. <br/><br/> The parameters work the same way as described in the description of `set_geometry_relative_to_canvas`.
| `hide`                            | Hides the feed of the provided slot. <br/> Note that the feed will still be transmitted to the viewer but is just hidden. By doing that, the feed can be shown again with a very low latency. <br/><br/> **Usage**: `hide <slot>`
| `show`                            | Shows the feed of the provided slot in case it was hidden. <br/><br/> **Usage**: `show <slot>`

## Notify-Interface

The camera server can notify its controller (usually PULT) by writing to a file which is provided in the config.
The controller can then read the file and process the messages.

In the case of PULT this file is a named pipe (mkfifo), which works perfectly fine.

This is a list of all sent messages. Note that a newline character `\n` is appended to every message.

| Message                            | Description
| ---------------------------------- | -----------
| `new_feed <slot>`                  | Sent after a sender on a slot has started transmitting a feed.
| `remove_feed <slot>`               | Sent after a sender on a slot has stopped transmitting a feed or the slot is deactivated (which also removes the feed).
| `custom_name <slot> <custom_name>` | Sent after a sender on a slot has started transmitting a feed and has set a custom name. The name is a string which is guaranteed to be escaped to prevent Cross-Site-Scripting (XSS) attacks. Note that the name can contain spaces but will never be an empty string. <br/> The controller should wrap the name into a HTML snippet and send it back to the camera server using the `set_annotation` command.

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

After a successful initialisation the connectin to Janus is established. When the camera is shared, the id of the transmitted Janus feed is determined and then sent to the server using the `set_feed_id` event. On the server the corresponding slot will save that feed id. This will then be used to tell all receivers which feed id to attach to.

When the sender socket disconnects, an event will be emitted, notifying the receivers to remove the corresponding feed.
