# Conecpt
This file is used to document the conecpts of the cvh-camera project.

# Socket Traffic
This section describes the socket traffic and the socket.io events that are used.

## Sender
When the sender web page expects an answer of the server, a callback can be passed to the emit function on. The server can then take that function as a parameter of the handler and call it with the response.

Server responses to request will always include the following fields:
* `success`: A boolean that indicates, whether the request was successful or not.
* `message`: A string that holds a user-friendly text to display. Holds the error in case one occurred.

In order to authenticate itself, the sender has to provide a slot and a token by emitting a `sender_init` event. These values are provided through the query string of the sender web page. When the server receives the `sender_init` event it validates the slot and the token and sends a response.

After a successful initialisation the connectin to janus is established. When the camera is shared, the feed id is received by janus and then transmitted to the server using the `set_feed_id` event. On the server the corresponding slot will save that feed id. This will then be used to tell all receivers which feed id to attach to.

