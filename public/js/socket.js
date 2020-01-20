$(document).ready(function () {
	var socket = io();
	socket.on('connect', function (socketio) {
		console.log('Client is connected to server')
	});

	// listen to event
	// socket.on('newMessage', function (message) {
	// 	console.log(message);
	// })

	//catch user id from browser
	var ID = $('#ID').val();
	//emit event for id
	socket.emit('ID', {
		ID: ID
	});

	socket.on('disconnect', function () {
		console.log('Client is disconnected from server');
	});
});
