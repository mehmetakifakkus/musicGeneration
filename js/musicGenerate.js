var balls = [], blocks = [];
colors = ['red', 'green', 'blue', 'orange', 'yellow', 'magenta', 'black', 'purple', 'gray', 'violet']
notes = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
values = [4, 2, 1] //{whole: 4, half: 2, quarter:1};
dirs = [[4, -3],[-4, -3], [2, -3], [-2, -3]];
piano = Synth.createInstrument('piano');

///////////////////  Mouse Interaction  ////////////////////

function onMouseMove(event){
    new Path.Line({from: [event.point.x, 0], to: [event.point.x, view.size.height], strokeWidth:2, strokeColor: 'black', opacity: 0.3}).removeOnMove()
}

function onMouseDown(event){
    var dd = new Path.Line({from: [event.point.x, 0], to: [event.point.x, view.size.height], strokeWidth:2, strokeColor: 'black'})
    blocks.push(dd)
}

///////////////////  Initialize  ////////////////////////

drawCoordinateSystem();
createRandomBalls(5);

///////////////// Note processing ///////////////////////

function showNote(xCoor, color){
    var res = obtainNote(xCoor)
    
    var txt = new PointText({ point: [xCoor-5, view.size.height - 20], justification: 'center', fontSize: 20, fillColor: color});
    txt.content = res.octave+""+res.note;

    txt.onFrame = function(){
        this.opacity -= 0.01
        this.position.y -= 3
        
        if(this.opacity <= 0)
            this.remove()
    }
    piano.play(res.note, res.octave, 2); // plays C4 for 2s using the 'piano' sound profile 
}

function obtainNote(xCoor){
    
    var noteIndex = Math.floor(xCoor / 36);

    var octave = Math.floor(noteIndex / 7) + 2;
    var note = notes[noteIndex % 7];

    return {note: note, octave: octave}
}


///////////////// Objects     ///////////////////////////

function Ball(type, p, v ){
    if(typeof Ball.id == 'undefined')
        Ball.id = 0;
    
    var tempObj = this;
    
    this.id = Ball.id++;     
    this.radius = 40 / values[type];
    this.gravity = 0.25 * values[type]
 	this.path = new Path.Circle({center: p, radius: this.radius, fillColor: colors[this.id], opacity: (this.gravity + 0.3)});
	
    this.vector = v; //new Point(0.8,0.5)
    this.oldState;
    
    this.applyGravity = function() {
        this.vector.y += this.gravity;
    };
    
    this.checkBoundaries = function() {
        var radius = this.radius + this.path.strokeWidth/2;
        var pos = this.path.position;

        // Check if it is in the arena
        if(pos.x + radius >= view.size.width || pos.x - radius <= 0)
            this.vector *= [-1, 1];
        if(pos.y + radius > view.size.height)
        {
            this.path.position.y = this.oldState.oldY
            this.vector = this.oldState.vector * [1, -1]
            showNote(pos.x, colors[this.id])
        }
        if(pos.y - radius < 0)
            this.vector *= [1, -1];
        
        this.oldState = {vector: this.vector, oldY: pos.y};        
    };
    
    this.checkBlocks = function(){
        for(var i=0; i<blocks.length; i++)
            for(var j=0; j<balls.length; j++)
                if(blocks[i].intersects(balls[j].path))                                     
                    balls[j].vector *= [-1, 1]
    }
    
    this.react = function(b) {
        var pos1 = this.path.position;
        var pos2 = b.path.position;	
        var dist = pos1.getDistance(pos2);

        var overlap = this.radius + b.radius - dist;

        if (overlap > 0) { // Check if they have collision	
            //var overlap = 1;
            var direc = (pos1 - pos2).normalize(overlap);
            this.vector += direc * (b.radius/(b.radius+this.radius));
            b.vector -= direc * (this.radius/(b.radius+this.radius));	
        }

        if (this.vector.x > 10 || this.vector.y>10)    // Check speed
            this.vector = this.vector.normalize(10);
    };
    
    this.path.onFrame = function() {
        tempObj.checkBoundaries();
        tempObj.checkBlocks();
        tempObj.applyGravity();

        tempObj.path.position += tempObj.vector;
//        for (var i = 0; i < balls.length; i++)
//            tempObj.react(balls[i])
    };
    
    this.remove = function(){
        this.collisionPath.remove();
        this.path.remove();
    }
    
    this.divideBall = function(){
    
        var r = tempObj.radius;   
        var pos = tempObj.path.position;

        if(r < 16){
            tempObj.remove(); 
            return;
        }

        var vector1 = new Point({ angle: 245, length: 8});
        var vector2 = new Point({ angle: 305, length: 8});

        balls.push(new Ball(3*r/5, pos + [-3*r/5,0], vector1));    
        balls.push(new Ball(3*r/5, pos + [3*r/5, 0], vector2));    
    }
};


//////////////// math functions  ////////////////////////

function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min)) + min;
}

//////////////// functions  /////////////////////////////


function createRandomBalls(count){
    for (var i = 0; i < count; i++) {
        var position = convertToRealCoord(new Point(getRandomInt(0, 25), 10))
        
        var s = getRandomInt(0, 2)
        var vector = new Point(dirs[s][0], dirs[s][1])
        
        var type = getRandomInt(0, 3)
        balls.push(new Ball(type, position, vector));
    }
}

function convertToRealCoord(p){
    var temp = p.clone();
    temp *= 36;
    temp.y = 480 - temp.y;
    return temp;
}

function drawCoordinateSystem(){
    
    image = new Raster({ source: 'css/music/llustration-of-piano-keys-v2.png'});
    image.matrix = new Matrix(0.94, 0, 0, 1, 0, view.size.height-40)
    image.translate([420,0])
    
    for(i = 0; i <= 13; i++){
        //new PointText({point: convertToRealCoord(new Point(0, 2*i)) + [3, +3], fontSize: '12px', fillColor: 'black', content: ' '+i*72, opacity: 0.6});  
        //new PointText({point: convertToRealCoord(new Point(2*i, 0)) + [-13, -2], fontSize: '12px', fillColor: 'black', content: ' '+i*72, opacity: 0.6});  
    }
    
    for(i = 0; i <= 27; i++){
       new Path.Line({from: convertToRealCoord(new Point(i, 0)), to: convertToRealCoord(new Point(i, 21)), strokeColor:'black', strokeWidth: 1, dashArray: [1,2], opacity: 0.2})  
       new Path.Line({from: convertToRealCoord(new Point(i, -0.2)), to: convertToRealCoord(new Point(i, 0)), strokeColor:'black', strokeWidth: 4, opacity: 0.5})
    }
}
