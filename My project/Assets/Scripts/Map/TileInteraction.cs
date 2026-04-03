using UnityEngine;
using UnityEngine.InputSystem;

namespace SLGCommander
{
    /// <summary>
    /// Left-click tap = select tile.
    /// Ignores taps that were actually drags (checked via MapCamera.LeftWasDragging).
    /// Converts screen → world → isometric grid → Tile.
    /// </summary>
    [DefaultExecutionOrder(-50)]
    public class TileInteraction : MonoBehaviour
    {
        private Camera             _cam;
        private ChunkedMapRenderer _mapRenderer;
        private MapCamera          _mapCamera;
        private Plane              _mapPlane = new(Vector3.forward, Vector3.zero);

        void Start()
        {
            _mapCamera   = FindFirstObjectByType<MapCamera>();
            _cam         = _mapCamera != null ? _mapCamera.GetComponent<Camera>() : Camera.main;
            _mapRenderer = FindFirstObjectByType<ChunkedMapRenderer>();
        }

        void Update()
        {
            if (_mapCamera == null)
            {
                _mapCamera = FindFirstObjectByType<MapCamera>();
                if (_mapCamera != null && _cam == null)
                    _cam = _mapCamera.GetComponent<Camera>();
            }

            if (_cam == null)
                _cam = Camera.main;

            if (_mapRenderer == null)
                _mapRenderer = FindFirstObjectByType<ChunkedMapRenderer>();

            if (_cam == null || Mouse.current == null) return;

            // Only act on left-button RELEASE
            if (!Mouse.current.leftButton.wasReleasedThisFrame) return;

            // If the user was dragging, skip selection
            if (_mapCamera != null && _mapCamera.LeftWasDragging) return;

            // Skip when pointer is over UI
            if (UnityEngine.EventSystems.EventSystem.current != null &&
                UnityEngine.EventSystems.EventSystem.current.IsPointerOverGameObject())
                return;

            Vector2 mp       = Mouse.current.position.ReadValue();
            Vector3 worldPos;
            var ray = _cam.ScreenPointToRay(mp);
            if (_mapPlane.Raycast(ray, out float enter))
                worldPos = ray.GetPoint(enter);
            else
                worldPos = _cam.ScreenToWorldPoint(new Vector3(mp.x, mp.y, 0f));

            worldPos.z = 0f;

            var tile = _mapRenderer?.GetTileAt(worldPos);
            GameManager.Instance?.SelectTile(tile);

            if (tile != null)
                Debug.Log($"[Pick] ({tile.x},{tile.y}) {tile.name} '{tile.terrain}' owner='{tile.owner}'");
        }
    }
}
