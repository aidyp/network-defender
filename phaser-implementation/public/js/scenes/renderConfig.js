/* Rendering constants for drawing */
var PHASER_RENDER_CONFIG = {
    colours: {
      blue: 0x0000FF,
      green: 0x00FF00,
      yellow: 0xFFFF00,
      red: 0xFF0000,
      white: 0xFFFFFF,
      grey: 0x808080
    },
    // Some Phaser objects prefer a different colour representation
    text_colours: {
      blue: '#0000FF',
      grey: '#808080'
    },
    node_size: 9,
    line_width: 4,
    image_centre: {
      x: 0,
      y: 0
    },
    width: 960,
    height: 720
};

function alternate_hex_encoding(colour) {
    // Some Phaser3 functions prefer their colours like '#{hex}' rather than '0x{hex}'
    var colour_str = String(colour);
    return '#'.concat(colour_str.slice(2, 8));

}

export { PHASER_RENDER_CONFIG, alternate_hex_encoding };