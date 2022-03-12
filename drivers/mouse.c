#include <stdio.h>
#include <Windows.h>
#define BUFFER_SIZE 9
#define MOUSE_BUFFER_SIZE 10


char hack_me[BUFFER_SIZE] = "1337x1337";
char copy_check[BUFFER_SIZE] = "1337x1337";
int new_x = 1337;
int new_y = 1337;
byte is_first = 0;
HCURSOR current_cursor = 65539;
//char empty_mouse_buffer[MOUSE_BUFFER_SIZE];
char mouse_buffer[MOUSE_BUFFER_SIZE];


int main(int argc, char* argv[]) {
  //for (int i = 0; i < MOUSE_BUFFER_SIZE; i++) {
  //  empty_mouse_buffer[i] = '\0';
  //}
  while (1) {
    CURSORINFO cursor;
    cursor.cbSize = sizeof(CURSORINFO);
    GetCursorInfo(&cursor);
    if (cursor.hCursor != current_cursor) {
      current_cursor = cursor.hCursor;
      //strcpy(mouse_buffer, empty_mouse_buffer);
      itoa((int)current_cursor, mouse_buffer, 10);
      //printf("%s\n", mouse_buffer);
    }
    if (strcmp(hack_me, copy_check) == 0)
      continue;
    // Memory changed
    new_x = 0;
    new_y = 0;
    is_first = 1;
    for (int i = 0; i < BUFFER_SIZE; i++) {
      if (is_first) {
        if (hack_me[i] == 'x') {
          is_first = 0;
          continue;
        }
        if (hack_me[i] == '\0') {
          continue;
        }
        new_x = new_x * 10 + (int)hack_me[i] - 0x30;
      }
      else {
        if (hack_me[i] == '\0') {
          break;
        }
        new_y = new_y * 10 + (int)hack_me[i] - 0x30;
      }
    }
    strcpy(copy_check, hack_me);
    SetCursorPos(new_x, new_y);
  }
  return 0;
}
