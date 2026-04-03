using UnityEngine;
using UnityEngine.InputSystem;

namespace SLGCommander
{
    /// <summary>
    /// Smooth isometric map camera (New Input System).
    ///   • Left-click tap = select tile (handled by TileInteraction)
    ///   • Left hold + drag = pan (mobile SLG style)
    ///   • Right-drag / Middle-drag = pan (classic)
    ///   • Scroll wheel = zoom towards cursor
    ///   • WASD / Arrow keys = keyboard pan
    /// </summary>
    [RequireComponent(typeof(Camera))]
    [DefaultExecutionOrder(-100)]
    public class MapCamera : MonoBehaviour
    {
        // ── Inspector ────────────────────────────────────────────────────

        [Header("Zoom")]
        public float defaultSize     = 40f;
        public float minSize         = 2f;
        public float maxSize         = 60f;   // gameplay zoom limit (overview panel for full map)
        [Range(1f, 10f)]
        public float zoomSensitivity = 4f;

        [Header("Pan")]
        [Range(0.1f, 5f)]
        public float keyPanSpeed = 20f;

        [Header("Left-Click Drag")]
        [Tooltip("Screen pixels of movement before left-click becomes a drag.")]
        public float dragPixelThreshold = 8f;

        // ── State ────────────────────────────────────────────────────────

        private Camera  _cam;
        private Vector3 _dragOriginWorld;
        private bool    _rmDragging;          // right/middle drag state
        private Plane   _mapPlane = new(Vector3.forward, Vector3.zero);

        // Left-button drag tracking
        private Vector2 _leftPressScreenPos;
        private bool    _leftPressed;
        private bool    _leftDragging;
        private bool    _leftWasDragging;     // true on the frame left-drag ended

        /// True if camera is currently being dragged (any button).
        public bool IsDragging => _rmDragging || _leftDragging;

        /// True on the frame the left-button drag ended (so TileInteraction can skip the tap).
        public bool LeftWasDragging => _leftWasDragging;

        // ── Unity lifecycle ───────────────────────────────────────────────

        void Awake()
        {
            _cam = GetComponent<Camera>();
            _cam.orthographic     = true;
            _cam.orthographicSize = defaultSize;
            _cam.clearFlags       = CameraClearFlags.SolidColor;
            _cam.backgroundColor  = new Color(0.024f, 0.039f, 0.055f);   // #060A0E

            // Center on map mid-point: grid (160,160) → world (0, -160)
            transform.position = new Vector3(0f, -160f, -200f);
        }

        void Update()
        {
            HandleZoom();
            HandleLeftDragPan();
            HandleRightMiddleDragPan();
            HandleKeyPan();
        }

        // ── Helpers ──────────────────────────────────────────────────────

        private Vector3 MouseWorldPos()
        {
            var mp = Mouse.current.position.ReadValue();
            var ray = _cam.ScreenPointToRay(mp);
            if (_mapPlane.Raycast(ray, out float enter))
                return ray.GetPoint(enter);

            return _cam.ScreenToWorldPoint(new Vector3(mp.x, mp.y, 0f));
        }

        // ── Zoom ─────────────────────────────────────────────────────────

        private void HandleZoom()
        {
            if (Mouse.current == null) return;

            float scroll = Mouse.current.scroll.ReadValue().y / 120f;
            if (Mathf.Abs(scroll) < 0.0001f) return;

            Vector3 worldBefore = MouseWorldPos();

            float newSize = Mathf.Clamp(
                _cam.orthographicSize * (1f - scroll * zoomSensitivity),
                minSize, maxSize);
            _cam.orthographicSize = newSize;

            Vector3 worldAfter = MouseWorldPos();
            transform.position += worldBefore - worldAfter;
        }

        // ── Left-button drag pan (mobile SLG style) ─────────────────────

        private void HandleLeftDragPan()
        {
            if (Mouse.current == null) return;

            // Press: record start position
            if (Mouse.current.leftButton.wasPressedThisFrame)
            {
                _leftPressScreenPos = Mouse.current.position.ReadValue();
                _leftPressed = true;
                _leftDragging = false;
            }

            // Hold: check distance threshold to start drag
            if (_leftPressed && Mouse.current.leftButton.isPressed)
            {
                if (!_leftDragging)
                {
                    float dist = Vector2.Distance(
                        Mouse.current.position.ReadValue(), _leftPressScreenPos);
                    if (dist > dragPixelThreshold)
                    {
                        _leftDragging = true;
                        _dragOriginWorld = MouseWorldPos();
                    }
                }

                if (_leftDragging)
                {
                    Vector3 current = MouseWorldPos();
                    transform.position += _dragOriginWorld - current;
                    _dragOriginWorld = MouseWorldPos();
                }
            }

            // Release: expose "was dragging" for one frame
            if (Mouse.current.leftButton.wasReleasedThisFrame)
            {
                _leftWasDragging = _leftDragging;
                _leftDragging = false;
                _leftPressed = false;
            }
            else
            {
                _leftWasDragging = false;
            }
        }

        // ── Right / Middle drag pan (classic) ────────────────────────────

        private void HandleRightMiddleDragPan()
        {
            if (Mouse.current == null) return;

            bool startBtn = Mouse.current.rightButton.wasPressedThisFrame
                         || Mouse.current.middleButton.wasPressedThisFrame;
            bool holdBtn  = Mouse.current.rightButton.isPressed
                         || Mouse.current.middleButton.isPressed;
            bool endBtn   = Mouse.current.rightButton.wasReleasedThisFrame
                         || Mouse.current.middleButton.wasReleasedThisFrame;

            if (startBtn)
            {
                _dragOriginWorld = MouseWorldPos();
                _rmDragging = true;
            }
            if (endBtn) _rmDragging = false;

            if (_rmDragging && holdBtn)
            {
                Vector3 current = MouseWorldPos();
                transform.position += _dragOriginWorld - current;
                _dragOriginWorld = MouseWorldPos();
            }
        }

        // ── Keyboard pan ─────────────────────────────────────────────────

        private void HandleKeyPan()
        {
            if (Keyboard.current == null) return;

            float dx = (Keyboard.current.dKey.isPressed || Keyboard.current.rightArrowKey.isPressed ? 1f : 0f)
                     - (Keyboard.current.aKey.isPressed || Keyboard.current.leftArrowKey.isPressed  ? 1f : 0f);
            float dy = (Keyboard.current.wKey.isPressed || Keyboard.current.upArrowKey.isPressed    ? 1f : 0f)
                     - (Keyboard.current.sKey.isPressed || Keyboard.current.downArrowKey.isPressed  ? 1f : 0f);

            if (dx == 0f && dy == 0f) return;

            float speed = keyPanSpeed * _cam.orthographicSize * 0.05f;
            transform.position += new Vector3(dx, dy, 0f) * speed * Time.deltaTime;
        }

        // ── Public API ────────────────────────────────────────────────────

        /// Immediately focus the camera on a world tile.
        public void FocusTile(Tile tile, float targetSize = -1f)
        {
            var world = ChunkedMapRenderer.GridToWorld(tile.x, tile.y);
            transform.position = new Vector3(world.x, world.y, transform.position.z);
            if (targetSize > 0f)
                _cam.orthographicSize = Mathf.Clamp(targetSize, minSize, maxSize);
        }
    }
}
