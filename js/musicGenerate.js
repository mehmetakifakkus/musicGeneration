
balls = []

var path = new Path.Rectangle({point:[0,0], size: [view.size.width, view.size.height], strokeColor:'red', strokeWidth: 10});

//border = new Path.Rectangle(0, 0, view.size.width, view.size.height)
//borderFlooor
notes = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
dirs = [[4, -3],[-4, -3], [2, -3], [-2, -3]];
piano = Synth.createInstrument('piano');

createRandomBalls(3);

function createRandomBalls(count){
    for (var i = 0; i < count; i++) {
        var position = [Math.random() * view.size.width, Math.floor(2*Math.random()+1)*120 + 60];
        //var vector = new Point({ angle: 270 + 90 * (2*Math.random()-1), length: 4});
        var vector = new Point(dirs[0][0], dirs[0][1])
        
        var type = 1
        balls.push(new Ball(type, position, vector));
    }
}

function obtainNote(xCoor){
    
    var noteIndex = Math.floor(xCoor / 36);

    var octave = Math.floor(noteIndex / 7) + 2;
    var note = notes[noteIndex % 7];

    console.log("  "+octave + " " +note)
    piano.play(note, octave, 2); // plays C4 for 2s using the 'piano' sound profile 
    
    var txt = new PointText({ point: [xCoor, view.size.height - 20], justification: 'center', fontSize: 20, fillColor: 'green'});
    txt.content = octave+""+note;

    txt.onFrame = function(){
        this.opacity -= 0.01
        this.position.y -= 3
        
        if(this.opacity <= 0)
            this.remove()
            
    }
    
}

function Ball(r, p, v ){
    var tempObj = this;
	this.radius = 10;
    this.gravity = 0.25
 	this.path = new Path.Circle({center: p, radius: this.radius, fillColor:'red'});
	this.vector = v; //new Point(0.8,0.5)
    
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
            pos.y = view.size.height - this.radius;  
            this.vector *= [1, -1];   
            //Crafty.audio.play("jump", 1, 0.2)  
            
            obtainNote(pos.x);
        }
        if(pos.y - radius <= 0)
            this.vector *= [1, -1];
        
    };
    
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
        tempObj.applyGravity();

        //tempObj.path.rotate(tempObj.vector.x * 2);
        tempObj.path.position += tempObj.vector;
        
        //for (var i = 0; i < balls.length; i++)
          //  tempObj.react(balls[i])
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


function convertToRealCoord(p){
    var temp = p.clone();
    temp *= 36;
    temp.y = 480 - temp.y;
    return temp;
}
function drawCoordinateSystem(){
    
    for(i = 0; i <= 14; i++){
        //new PointText({point: convertToRealCoord(new Point(0, 2*i)) + [3, +3], fontSize: '12px', fillColor: 'black', content: ' '+i*72, opacity: 0.6});  
        //new PointText({point: convertToRealCoord(new Point(2*i, 0)) + [-13, -2], fontSize: '12px', fillColor: 'black', content: ' '+i*72, opacity: 0.6});  
    }
    
    for(i = 0; i <= 27; i++){
       new Path.Line({from: convertToRealCoord(new Point(i, 0)), to: convertToRealCoord(new Point(i, 21)), strokeColor:'black', strokeWidth: 1, dashArray: [1,2], opacity: 0.2})  
       new Path.Line({from: convertToRealCoord(new Point(i, -0.2)), to: convertToRealCoord(new Point(i, 0)), strokeColor:'black', strokeWidth: 4, opacity: 0.5})
    }
}
drawCoordinateSystem();