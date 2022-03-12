"use strict";

/**
 * Adapter to use visual screen in browsers (in contrast to node)
 * @constructor
 *
 * @param {BusConnector} bus
 */
function ScreenAdapter(screen_container, bus) {
    console.assert(screen_container, "1st argument must be a DOM container");

    var
        graphic_screen = screen_container.getElementsByTagName("canvas")[0],
        graphic_context = graphic_screen.getContext("2d", {
            alpha: false
        });

    var
        /** @type {number} */
        cursor_row,

        /** @type {number} */
        cursor_col,

        // are we in graphical mode now?
        is_graphical = false;

    var stopped = false;

    var screen = this;

    graphic_context["imageSmoothingEnabled"] = false;

    graphic_screen.style.display = "block";

    this.bus = bus;

    bus.register("screen-set-mode", function(data) {
        this.set_mode(data);
    }, this);

    bus.register("screen-fill-buffer-end", function(data) {
        this.update_buffer(data);
    }, this);

    bus.register("screen-clear", function() {
        this.clear_screen();
    }, this);
    bus.register("screen-set-size-graphical", function(data) {
        this.set_size_graphical(data[0], data[1], data[2], data[3]);
    }, this);


    this.init = function() {
        this.timer();
    };

    this.make_screenshot = function() {
        try {
            const image = new Image();
            image.src = graphic_screen.toDataURL("image/png");
            const w = window.open("");
            w.document.write(image.outerHTML);
        } catch (e) {}
    };

    this.put_char = function(row, col, chr, bg_color, fg_color) {
        if (row < text_mode_height && col < text_mode_width) {
            var p = 3 * (row * text_mode_width + col);

            dbg_assert(chr >= 0 && chr < 0x100);
            text_mode_data[p] = chr;
            text_mode_data[p + 1] = bg_color;
            text_mode_data[p + 2] = fg_color;

            changed_rows[row] = 1;
        }
    };

    this.timer = function() {
        if (!stopped) {
            requestAnimationFrame(update_graphical);
        }
    };

    var update_graphical = function() {
        if (is_graphical)
            this.bus.send("screen-fill-buffer");
        this.timer();
    }.bind(this);

    this.destroy = function() {
        stopped = true;
    };

    this.set_mode = function(graphical) {
        is_graphical = graphical;
    };

    this.clear_screen = function() {
        graphic_context.fillStyle = "#000";
        graphic_context.fillRect(0, 0, graphic_screen.width, graphic_screen.height);
    };

    this.set_size_graphical = function(width, height, buffer_width, buffer_height) {
        graphic_screen.style.display = "block";

        graphic_screen.width = width;
        graphic_screen.height = height;
    };

    this.update_buffer = function(layers) {
        layers.forEach(layer => {
            graphic_context.putImageData(
                layer.image_data,
                layer.screen_x - layer.buffer_x,
                layer.screen_y - layer.buffer_y,
                layer.buffer_x,
                layer.buffer_y,
                layer.buffer_width,
                layer.buffer_height
            );
        });
    };

    this.init();
}
