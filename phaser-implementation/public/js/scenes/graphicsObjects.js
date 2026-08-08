import { eventsRouter } from "./eventsRouter.js";
import { PHASER_RENDER_CONFIG } from "./renderConfig.js";



class EdgeGraphic extends Phaser.GameObjects.Line {
    constructor(scene, x, y, x1, y1, x2, y2, strokeColor) {
      super (scene, x, y, x1, y1, x2, y2, strokeColor);
      scene.add.existing(this);
      this.setDisplayOrigin(0, 0); //Set the origin here to make it work, no idea why
    }
  }
  
class NodeGraphic extends Phaser.GameObjects.Arc {
    constructor(scene, node_id, x, y, radius, fillColor, fillAlpha) {    
        super(scene, x, y, radius, 0, 360, false, fillColor, fillAlpha);    
        this.node_id = Number(node_id); // For type consistency
        scene.add.existing(this);
        this.setInteractive({ useHandCursor: true})
        .on('pointerdown', () => this.on_node_click() );
    }

    on_node_click() {
        eventsRouter.emit('node_clicked', this.node_id);
    }
}

class MapGUI {
    constructor(scene) {
        this.scene = scene
        this.node_graphics = {};
        this.edge_graphics = {};
        this.built = false;
    }

    scale_node_position(node_position, width, height) {
        var scaled_xy = [(node_position[0] * width), (node_position[1]* height)];
        return scaled_xy;
    }

    /**
     * The layout (edges + nodes) never changes within a session - only
     * which nodes are coloured does. So this builds the graphics once
     * and every later call just recolours the existing objects, instead
     * of piling up a fresh set of GameObjects per redraw.
     */
    draw_map(mapInfo) {
        this._build_layout(mapInfo);
        this._colour_nodes(mapInfo);
    }

    _build_layout(mapInfo) {
        if (this.built) {return}
        this.built = true;

        let left, right, x1, y1, x2, y2;
        for (var i = 0; i < mapInfo.edges.length; i++) {
            var edge = mapInfo.edges[i];
            [left, right] = edge;
            [x1, y1] = this.scale_node_position(mapInfo.positions[left], PHASER_RENDER_CONFIG.width, PHASER_RENDER_CONFIG.height);
            [x2, y2] = this.scale_node_position(mapInfo.positions[right], PHASER_RENDER_CONFIG.width, PHASER_RENDER_CONFIG.height);
            var drawn_edge = new EdgeGraphic(this.scene,
                PHASER_RENDER_CONFIG.image_centre.x,
                PHASER_RENDER_CONFIG.image_centre.y,
                x1,
                y1,
                x2,
                y2,
                PHASER_RENDER_CONFIG.colours.white);
                this.edge_graphics[i] = drawn_edge;

        }

        let x, y;
        for (var i = 0; i < mapInfo.nodes.length; i++) {
            [x, y] = this.scale_node_position(mapInfo.positions[i], PHASER_RENDER_CONFIG.width, PHASER_RENDER_CONFIG.height);
            var circle = new NodeGraphic(this.scene, i, x, y, PHASER_RENDER_CONFIG.node_size, PHASER_RENDER_CONFIG.colours.white, 1);
            this.node_graphics[i] = circle;
        }
    }

    _colour_nodes(mapInfo) {
        // Reset everyone to white (and clear any leftover highlight ring)
        // first, so a node that's no longer occupied doesn't stay coloured.
        Object.values(this.node_graphics).forEach((node) => {
            node.setFillStyle(PHASER_RENDER_CONFIG.colours.white, 1);
            this._clear_highlighted_node(node.node_id);
        });

        // For now the order will help visually show who has won
        // But to change after prototyping
        this.node_graphics[mapInfo.characters.honey].setFillStyle(PHASER_RENDER_CONFIG.colours.yellow, 1);
        this.node_graphics[mapInfo.characters.robber].setFillStyle(PHASER_RENDER_CONFIG.colours.red, 1);
        this.node_graphics[mapInfo.characters.cop].setFillStyle(PHASER_RENDER_CONFIG.colours.green, 1);
    }

    highlight_node(node_id, colour) {
        this.node_graphics[node_id].setStrokeStyle(PHASER_RENDER_CONFIG.line_width, colour, 1);
    }

    clear_all_nodes_but(node_id) {
        for (var i = 0; i < Object.keys(this.node_graphics).length
        ; i++) {
            if (i === node_id) {continue}
            this._clear_highlighted_node(i);
        }
    }

    _clear_highlighted_node(node_id) {
        var base_colour = this.node_graphics[node_id].fillColor;
        this.node_graphics[node_id].setStrokeStyle(PHASER_RENDER_CONFIG.line_width, base_colour, 1);
    }


}

export { EdgeGraphic, NodeGraphic, MapGUI };

