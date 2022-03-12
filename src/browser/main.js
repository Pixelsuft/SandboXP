"use strict";

(function() {
  /** @const */
  var ON_LOCALHOST = !location.hostname.endsWith("copy.sh");

  var mouse_offset = 0;
  var cursor_offset = 0;
  var last_cursor = 0;
  var cursor_interval;
  const text_encoder = new TextEncoder();
  const text_decoder = new TextDecoder();
  // 65559, 65561, 65573, 65579 - may be uncorrect
  // crosshair, default (Handwriting), not-allowed, n-resize (Alternate Select)
  const cursors = {
    0: 'none',
    NaN: 'default',
    65553: 'default',
    65555: 'text',
    65557: 'wait',
    65559: 'default',
    65561: 'not-allowed',
    65563: 'nw-resize',
    65565: 'sw-resize',
    65567: 'e-resize',
    65569: 'n-resize',
    65571: 'move',
    65573: 'crosshair',
    65575: 'progress',
    65577: 'help',
    65579: 'n-resize',
    65581: 'pointer',
  };

  /**
   * @return {Object.<string, string>}
   */
  function get_query_arguments() {
    var query = location.search.substr(1).split("&");
    var parameters = {};

    for (var i = 0; i < query.length; i++) {
      var param = query[i].split("=");
      parameters[param[0]] = decodeURIComponent(param.slice(1).join("="));
    }

    return parameters;
  }

  function format_timestamp(time) {
    if (time < 60) {
      return time + "s";
    } else if (time < 3600) {
      return (time / 60 | 0) + "m " + v86util.pad0(time % 60, 2) + "s";
    } else {
      return (time / 3600 | 0) + "h " +
        v86util.pad0((time / 60 | 0) % 60, 2) + "m " +
        v86util.pad0(time % 60, 2) + "s";
    }
  }

  var progress_ticks = 0;

  function show_progress(e) {
    var el = $("loading");
    el.style.display = "block";

    if (e.file_name.endsWith(".wasm")) {
      const parts = e.file_name.split("/");
      el.textContent = "Executing " + parts[parts.length - 1] + "...";
      return;
    }

    if (e.file_index === e.file_count - 1 && e.loaded >= e.total - 2048) {
      // last file is (almost) loaded
      el.textContent = "Booting...";
      return;
    }

    var line = "Downloading Windows XP ";

    if (typeof e.file_index === "number" && e.file_count) {
      line += "[" + (e.file_index + 1) + "/" + e.file_count + "] ";
    }

    if (e.total && typeof e.loaded === "number") {
      var per100 = Math.floor(e.loaded / e.total * 100);
      per100 = Math.min(100, Math.max(0, per100));

      var per50 = Math.floor(per100 / 2);

      line += per100 + "% [";
      line += "#".repeat(per50);
      line += " ".repeat(50 - per50) + "]";
    } else {
      line += ".".repeat(progress_ticks++ % 50);
    }

    el.textContent = line;
  }

  function $(id) {
    return document.getElementById(id);
  }

  function onload() {
    if (!window.WebAssembly) {
      alert("Your browser is not supported because it doesn't support WebAssembly");
      return;
    }

    var settings = {};

    $("start_emulation").onclick = function() {
      $("boot_options").style.display = "none";
      set_profile("custom");

      var images = [];
      var last_file;

      var floppy_file = $("floppy_image").files[0];
      if (floppy_file) {
        last_file = floppy_file;
        settings.fda = {
          buffer: floppy_file
        };
      }

      var cd_file = $("cd_image").files[0];
      if (cd_file) {
        last_file = cd_file;
        settings.cdrom = {
          buffer: cd_file
        };
      }

      var hda_file = $("hda_image").files[0];
      if (hda_file) {
        last_file = hda_file;
        settings.hda = {
          buffer: hda_file
        };
      }

      var hdb_file = $("hdb_image") && $("hdb_image").files[0];
      if (hdb_file) {
        last_file = hdb_file;
        settings.hdb = {
          buffer: hdb_file
        };
      }

      if ($("multiboot_image")) {
        var multiboot_file = $("multiboot_image").files[0];
        if (multiboot_file) {
          last_file = multiboot_file;
          settings.multiboot = {
            buffer: multiboot_file
          };
        }
      }

      start_emulation(settings);
    };

    const query_args = get_query_arguments();
    const host = query_args["cdn"] || (ON_LOCALHOST ? "images/" : "//k.copy.sh/");

    // Abandonware OS images are from https://winworldpc.com/library/operating-systems
    var oses = [{
        id: "winxp",
        memory_size: 128 * 1024 * 1024,
        vga_memory_size: 4 * 1024 * 1024,
        hda: {
          /*"url": "xp.img",
          use_parts: false,
          "async": false,*/
          "url": "xp_out/xp.img",
          "fixed_chunk_size": 134211,
          use_parts: true,
          "async": true,
          "size": 2684215296,
        },
        state: {
          url: "xp_state.bin.zst",
          size: 35045486
        },
        name: "Windows XP",
        acpi: false,
        preserve_mac_from_state_image: false,
        boot_order: 0x123
      },
      {
        id: "winxp-boot",
        memory_size: 128 * 1024 * 1024,
        vga_memory_size: 4 * 1024 * 1024,
        hda: {
          /*"url": "xp.img",
          use_parts: false,
          "async": false,*/
          "url": "xp_out/xp.img",
          "fixed_chunk_size": 134211,
          use_parts: true,
          "async": true,
          "size": 2684215296,
        },
        name: "Windows XP",
        acpi: false,
        preserve_mac_from_state_image: false,
        boot_order: 0x123
      }
    ];

    var profile = query_args["profile"];

    if (query_args["use_bochs_bios"]) {
      settings.use_bochs_bios = true;
    }

    const m = parseInt(query_args["m"], 10);
    if (m > 0) {
      settings.memory_size = Math.max(16, m) * 1024 * 1024;
    }

    const vram = parseInt(query_args["vram"], 10);
    if (vram > 0) {
      settings.vga_memory_size = vram * 1024 * 1024;
    }

    settings.networking_proxy = query_args["networking_proxy"];
    settings.audio = query_args["audio"] !== "0";
    settings.acpi = query_args["acpi"];

    for (var i = 0; i < oses.length; i++) {
      var infos = oses[i];

      if (profile === infos.id) {
        start_profile(infos);
        return;
      }

      var element = $("start_" + infos.id);

      if (element) {
        element.onclick = function(infos, element, e) {
          e.preventDefault();
          set_profile(infos.id);
          element.blur();

          start_profile(infos);
        }.bind(this, infos, element);
      }
    }

    if (profile === "custom") {
      if (query_args["hda.url"]) {
        settings.hda = {
          "size": parseInt(query_args["hda.size"], 10) || undefined,
          "url": query_args["hda.url"],
          "async": true,
        };
      }

      if (query_args["cdrom.url"]) {
        settings.cdrom = {
          "size": parseInt(query_args["cdrom.size"], 10) || undefined,
          "url": query_args["cdrom.url"],
          "async": true,
        };
      }

      if (query_args["fda.url"]) {
        settings.fda = {
          "size": parseInt(query_args["fda.size"], 10) || undefined,
          "url": query_args["fda.url"],
          "async": false,
        };
      }

      if (settings.fda || settings.cdrom || settings.hda) {
        $("boot_options").style.display = "none";

        start_emulation(settings, done);
      }
    }

    function start_profile(infos) {
      $("boot_options").style.display = "none";

      settings.filesystem = infos.filesystem;

      if (infos.state) {
        settings.initial_state = infos.state;
      }

      settings.fda = infos.fda;
      settings.cdrom = infos.cdrom;
      settings.hda = infos.hda;
      settings.multiboot = infos.multiboot;
      settings.bzimage = infos.bzimage;
      settings.initrd = infos.initrd;
      settings.cmdline = infos.cmdline;
      settings.bzimage_initrd_from_filesystem = infos.bzimage_initrd_from_filesystem;
      settings.preserve_mac_from_state_image = infos.preserve_mac_from_state_image;

      settings.acpi = (!infos.state && settings.acpi !== undefined) ? settings.acpi : infos.acpi;
      settings.memory_size = (!infos.state && settings.memory_size) ? settings.memory_size : infos.memory_size;
      settings.vga_memory_size = (!infos.state && settings.vga_memory_size) ? settings.vga_memory_size : infos.vga_memory_size;

      settings.id = infos.id;

      if (infos.boot_order !== undefined) {
        settings.boot_order = infos.boot_order;
      }

      start_emulation(settings, done);
    }

    function done(emulator) {
      if (query_args["c"]) {
        setTimeout(function() {
          //emulator.serial0_send(query_args["c"] + "\n");
          emulator.keyboard_send_text(query_args["c"] + "\n");
        }, 25);
      }
    }
  }

  window.addEventListener("load", onload, false);

  // old webkit fires popstate on every load, fuck webkit
  // https://code.google.com/p/chromium/issues/detail?id=63040
  window.addEventListener("load", function() {
    setTimeout(function() {
      window.addEventListener("popstate", onpopstate);
    }, 0);
  });

  // works in firefox and chromium
  if (document.readyState === "complete") {
    onload();
  }

  /** @param {?=} done */
  function start_emulation(settings, done) {
    /** @const */
    var MB = 1024 * 1024;

    var memory_size = settings.memory_size;

    if (!memory_size) {
      memory_size = parseInt($("memory_size").value, 10) * MB;

      if (!memory_size) {
        alert("Invalid memory size - reset to 128MB");
        memory_size = 128 * MB;
      }
    }

    var vga_memory_size = settings.vga_memory_size;

    if (!vga_memory_size) {
      vga_memory_size = parseInt($("video_memory_size").value, 10) * MB;

      if (!vga_memory_size) {
        alert("Invalid video memory size - reset to 8MB");
        vga_memory_size = 8 * MB;
      }
    }

    if (!settings.fda) {
      var floppy_file = $("floppy_image").files[0];
      if (floppy_file) {
        settings.fda = {
          buffer: floppy_file
        };
      }
    }

    const networking_proxy = settings.networking_proxy === undefined ? $("networking_proxy").value : settings.networking_proxy;
    const disable_audio = settings.audio === undefined ? $("disable_audio").checked : !settings.audio;
    const enable_acpi = settings.acpi === undefined ? $("enable_acpi").checked : settings.acpi;

    /** @const */
    var BIOSPATH = "bios/";

    if (settings.use_bochs_bios) {
      var biosfile = "bochs-bios.bin";
      var vgabiosfile = "bochs-vgabios.bin";
    } else {
      var biosfile = "seabios.bin";
      var vgabiosfile = "vgabios.bin";
    }

    var bios;
    var vga_bios;

    // a bios is only needed if the machine is booted
    if (!settings.initial_state) {
      bios = {
        "url": BIOSPATH + biosfile,
      };
      vga_bios = {
        "url": BIOSPATH + vgabiosfile,
      };
    }

    var emulator = new V86Starter({
      "memory_size": memory_size,
      "vga_memory_size": vga_memory_size,

      "screen_container": $("screen_container"),
      "serial_container_xtermjs": $("terminal"),

      "boot_order": settings.boot_order || parseInt($("boot_order").value, 16) || 0,

      "network_relay_url": ON_LOCALHOST ? "ws://localhost:8080/" : networking_proxy,

      "bios": bios,
      "vga_bios": vga_bios,

      "fda": settings.fda,
      "hda": settings.hda,
      "hdb": settings.hdb,
      "cdrom": settings.cdrom,

      "multiboot": settings.multiboot,
      "bzimage": settings.bzimage,
      "initrd": settings.initrd,
      "cmdline": settings.cmdline,
      "bzimage_initrd_from_filesystem": settings.bzimage_initrd_from_filesystem,

      "acpi": enable_acpi,
      "initial_state": settings.initial_state,
      "filesystem": settings.filesystem || {},
      "disable_speaker": disable_audio,
      "preserve_mac_from_state_image": settings.preserve_mac_from_state_image,

      "autostart": true,
    });

    emulator.add_listener("emulator-ready", function() {
      if (emulator.v86.cpu.wm.exports["profiler_is_enabled"]()) {
        const CLEAR_STATS = false;

        var panel = document.createElement("pre");
        document.body.appendChild(panel);

        setInterval(function() {
          if (!emulator.is_running()) {
            return;
          }

          const text = print_stats.stats_to_string(emulator.v86.cpu);
          panel.textContent = text;

          CLEAR_STATS && emulator.v86.cpu.clear_opstats();
        }, CLEAR_STATS ? 5000 : 1000);
      }

      init_ui(settings, emulator);

      done && done(emulator);
    });

    emulator.add_listener("download-progress", function(e) {
      show_progress(e);
    });

    emulator.add_listener("download-error", function(e) {
      var el = $("loading");
      el.style.display = "block";
      el.textContent = "Loading " + e.file_name + " failed. Check your connection " +
        "and reload the page to try again.";
    });
  }

  /**
   * @param {Object} settings
   * @param {V86Starter} emulator
   */
  function init_ui(settings, emulator) {
    $("boot_options").style.display = "none";
    $("loading").style.display = "none";
    $("runtime_options").style.display = "block";
    $("runtime_infos").style.display = "block";
    $("screen_container").style.display = "block";

    if (settings.id == 'winxp') {
      mouse_offset = 0x02320008;
      cursor_offset = 0x023243E4;
      last_cursor = 0;
      cursor_interval = setInterval(check_cursor, 1000 / 10);
    }

    $("exit").onclick = function() {
      emulator.stop();
      location.href = location.pathname;
    };

    var last_tick = 0;
    var running_time = 0;
    var last_instr_counter = 0;
    var interval = null;
    var os_uses_mouse = false;
    var total_instructions = 0;

    function update_info() {
      var now = Date.now();

      var instruction_counter = emulator.get_instruction_counter();

      if (instruction_counter < last_instr_counter) {
        // 32-bit wrap-around
        last_instr_counter -= 0x100000000;
      }

      var last_ips = instruction_counter - last_instr_counter;
      last_instr_counter = instruction_counter;
      total_instructions += last_ips;

      var delta_time = now - last_tick;

      if (delta_time) {
        running_time += delta_time;
        last_tick = now;

        $("speed").textContent = (last_ips / 1000 / delta_time).toFixed(1);
        $("avg_speed").textContent = (total_instructions / 1000 / running_time).toFixed(1);
        $("running_time").textContent = format_timestamp(running_time / 1000 | 0);
      }
    }

    emulator.add_listener("emulator-started", function() {
      last_tick = Date.now();
      interval = setInterval(update_info, 1000);
    });

    emulator.add_listener("emulator-stopped", function() {
      update_info();
      if (interval !== null) {
        clearInterval(interval);
      }
    });

    var stats_storage = {
      read: 0,
      read_sectors: 0,
      write: 0,
      write_sectors: 0,
    };

    emulator.add_listener("ide-read-start", function() {
      $("info_storage").style.display = "block";
      $("info_storage_status").textContent = "Loading ...";
    });
    emulator.add_listener("ide-read-end", function(args) {
      stats_storage.read += args[1];
      stats_storage.read_sectors += args[2];

      $("info_storage_status").textContent = "Idle";
      $("info_storage_bytes_read").textContent = stats_storage.read;
      $("info_storage_sectors_read").textContent = stats_storage.read_sectors;
    });
    emulator.add_listener("ide-write-end", function(args) {
      stats_storage.write += args[1];
      stats_storage.write_sectors += args[2];

      $("info_storage_bytes_written").textContent = stats_storage.write;
      $("info_storage_sectors_written").textContent = stats_storage.write_sectors;
    });

    add_image_download_button(settings.hda, "hda");
    add_image_download_button(settings.hdb, "hdb");
    add_image_download_button(settings.fda, "fda");
    add_image_download_button(settings.fdb, "fdb");
    add_image_download_button(settings.cdrom, "cdrom");

    function add_image_download_button(obj, type) {
      var elem = $("get_" + type + "_image");

      if (!obj || obj.size > 100 * 1024 * 1024) {
        elem.style.display = "none";
        return;
      }

      elem.onclick = function(e) {
        let buffer = emulator.disk_images[type];
        let filename = settings.id + (type === "cdrom" ? ".iso" : ".img");

        if (buffer.get_as_file) {
          var file = buffer.get_as_file(filename);
          download(file, filename);
        } else {
          buffer.get_buffer(function(b) {
            if (b) {
              dump_file(b, filename);
            } else {
              alert("The file could not be loaded. Maybe it's too big?");
            }
          });
        }

        elem.blur();
      };
    }

    $("memory_dump").onclick = function() {
      const mem8 = emulator.v86.cpu.mem8;
      dump_file(new Uint8Array(mem8.buffer, mem8.byteOffset, mem8.length), "v86memory.bin");
      $("memory_dump").blur();
    };

    //$("memory_dump_dmp").onclick = function()
    //{
    //    var memory = emulator.v86.cpu.mem8;
    //    var memory_size = memory.length;
    //    var page_size = 4096;
    //    var header = new Uint8Array(4096);
    //    var header32 = new Int32Array(header.buffer);

    //    header32[0] = 0x45474150; // 'PAGE'
    //    header32[1] = 0x504D5544; // 'DUMP'

    //    header32[0x10 >> 2] = emulator.v86.cpu.cr[3]; // DirectoryTableBase
    //    header32[0x24 >> 2] = 1; // NumberProcessors
    //    header32[0xf88 >> 2] = 1; // DumpType: full dump
    //    header32[0xfa0 >> 2] = header.length + memory_size; // RequiredDumpSpace

    //    header32[0x064 + 0 >> 2] = 1; // NumberOfRuns
    //    header32[0x064 + 4 >> 2] = memory_size / page_size; // NumberOfPages
    //    header32[0x064 + 8 >> 2] = 0; // BasePage
    //    header32[0x064 + 12 >> 2] = memory_size / page_size; // PageCount

    //    dump_file([header, memory], "v86memory.dmp");

    //    $("memory_dump_dmp").blur();
    //};

    $("save_state").onclick = function() {
      emulator.save_state(function(error, result) {
        if (error) {
          console.log(error.stack);
          console.log("Couldn't save state: ", error);
        } else {
          dump_file(result, "v86state.bin");
        }
      });

      $("save_state").blur();
    };

    $("load_state").onclick = function() {
      $("load_state_input").click();
      $("load_state").blur();
    };

    $("load_state_input").onchange = function() {
      var file = this.files[0];

      if (!file) {
        return;
      }

      var was_running = emulator.is_running();

      if (was_running) {
        emulator.stop();
      }

      var filereader = new FileReader();
      filereader.onload = function(e) {
        try {
          emulator.restore_state(e.target.result);
        } catch (err) {
          alert("Something bad happened while restoring the state:\n" + err + "\n\n" +
            "Note that the current configuration must be the same as the original");
          throw err;
        }

        if (was_running) {
          emulator.run();
        }
      };
      filereader.readAsArrayBuffer(file);

      this.value = "";
    };

    function check_cursor() {
      if (!emulator.is_running())
        return;
      const cursor_buf = parseInt(text_decoder.decode(emulator.read_memory(cursor_offset, 10)), 10);
      if (cursor_buf == last_cursor)
        return;
      if (cursors[cursor_buf]) {
        $('vga').style.cursor = cursors[cursor_buf];
      } else {
        if (cursor_buf == NaN) {
        clearInterval(check_cursor);
          $('vga').style.cursor = 'default';
        } else {
          $('vga').style.cursor = 'none';
          console.log('TODO: Custom cursor ' + cursor_buf);
        }
      }
      last_cursor = cursor_buf;
    }

    function write_mouse_pos(x, y) {
      const buffer = x + 'x' + y;
      emulator.write_memory(text_encoder.encode(buffer + '\x00'.repeat(9 - buffer.length)), mouse_offset);
    }

    $("vga").onmousemove = function(e) {
      if (mouse_offset) {
        write_mouse_pos(e.offsetX, e.offsetY);
      }
    }

    $("vga").ondrop = $("vga").ondragleave = $("vga").ondragenter = $("vga").ondragover = function(e) {
      e.preventDefault();
      e.stopPropagation();
    }

    function shared_str_size(old_int) {
      const result = old_int.toString();
      return text_encoder.encode('c' + result);
    }

    $("vga").ondrop = function(e) {
      e.preventDefault();
      e.stopPropagation();
      /*if (!shared_offset)
        return;
      const file_list = e.dataTransfer.files;
      for (var i = 0; i < file_list.length; i++) {
        const reader = new FileReader();
        const file = file_list[i];
        reader.onload = function() {
          file_buffer.push([
            'C:\\Documents and Settings\\Administrator\\Desktop\\' + file.name.replaceAll('\\', '/').split('/').pop(-1),
            new Uint8Array(reader.result),
            true
          ]);
          process_files();
        }
        reader.readAsArrayBuffer(file);
      }*/
    }

    $("vga").oncontextmenu = function(e) {
      return e.preventDefault();
    }

    $("ctrlaltdel").onclick = function() {
      emulator.keyboard_send_scancodes([
        0x1D, // ctrl
        0x38, // alt
        0x53, // delete

        // break codes
        0x1D | 0x80,
        0x38 | 0x80,
        0x53 | 0x80,
      ]);

      $("ctrlaltdel").blur();
    };

    $("alttab").onclick = function() {
      emulator.keyboard_send_scancodes([
        0x38, // alt
        0x3E, // f4
      ]);

      setTimeout(function() {
        emulator.keyboard_send_scancodes([
          0x38 | 0x80,
          0x3E | 0x80,
        ]);
      }, 100);

      $("alttab").blur();
    };

    $("fullscreen").onclick = function() {
      emulator.screen_go_fullscreen();
    };

    $("screen_container").onclick = function() {

      // allow text selection
      if (window.getSelection().isCollapsed) {
        let phone_keyboard = document.getElementsByClassName("phone_keyboard")[0];

        // stop mobile browser from scrolling into view when the keyboard is shown
        phone_keyboard.style.top = document.body.scrollTop + 100 + "px";
        phone_keyboard.style.left = document.body.scrollLeft + 100 + "px";

        phone_keyboard.focus();
      }
    };

    const phone_keyboard = document.getElementsByClassName("phone_keyboard")[0];

    phone_keyboard.setAttribute("autocorrect", "off");
    phone_keyboard.setAttribute("autocapitalize", "off");
    phone_keyboard.setAttribute("spellcheck", "false");
    phone_keyboard.tabIndex = 0;

    $("screen_container").addEventListener("mousedown", (e) => {
      e.preventDefault();
      phone_keyboard.focus();
    }, false);

    $("take_screenshot").onclick = function() {
      emulator.screen_make_screenshot();
      $("take_screenshot").blur();
    };

    window.addEventListener("keydown", ctrl_w_rescue, false);
    window.addEventListener("keyup", ctrl_w_rescue, false);
    window.addEventListener("blur", ctrl_w_rescue, false);

    function ctrl_w_rescue(e) {
      if (e.ctrlKey) {
        window.onbeforeunload = function() {
          window.onbeforeunload = null;
          return "CTRL-W cannot be sent to the emulator.";
        };
      } else {
        window.onbeforeunload = null;
      }
    }
  }

  function onpopstate(e) {
    location.reload();
  }

  function set_profile(prof) {
    if (window.history.pushState) {
      window.history.pushState({
        profile: prof
      }, "", "?profile=" + prof);
    }
  }

})();
