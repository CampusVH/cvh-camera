# CVH-Camera
The CVH-Camera project provides a way to share a camera view using the Janus WebRTC gateway. It is designed to be used with the PULT project available at [ https://gitlab.cvh-server.de/pgerwinski/pult ](https://gitlab.cvh-server.de/pgerwinski/pult).

Note that the project and its documentation are still in development.

# Socket Traffic
This section describes the socket traffic and the socket.io events that are used.

## Sender
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
* `message`: A string that holds a user-friendly text to display. Holds the error in case one occurred.

In order to authenticate itself, the sender has to provide a slot and a token by emitting a `sender_init` event. These values are provided through the query string of the sender web page. When the server receives the `sender_init` event it validates the slot and the token and sends a response.

After a successful initialisation the connectin to janus is established. When the camera is shared, the feed id is received by janus and then transmitted to the server using the `set_feed_id` event. On the server the corresponding slot will save that feed id. This will then be used to tell all receivers which feed id to attach to.

When the sender socket disconnects, an event will be emitted to the receivers telling them to remove the feed.
