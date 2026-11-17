"""Image service - manages Docker image listing, metadata, and dangling detection."""
from typing import List, Dict, Any, Optional
from app.services.docker_service import docker_service
import logging
import re

logger = logging.getLogger(__name__)


class ImageService:
    def _validate_image_identifier(self, image_id: str) -> None:
        """Validate image identifier to prevent injection or malformed strings."""
        if not image_id or not isinstance(image_id, str):
            raise ValueError("Image identifier cannot be empty")
        if not re.match(r"^[a-zA-Z0-9_\-\.:/]{1,256}$", image_id.strip()):
            raise ValueError("Invalid image identifier format")

    def get_images(self) -> List[Dict[str, Any]]:
        """List Docker images with in-use status and dangling identification."""
        if not docker_service.is_connected:
            return []

        try:
            images = docker_service._client.images.list(all=True)
            # Find which images are referenced by containers
            containers = []
            try:
                containers = docker_service._client.containers.list(all=True)
            except Exception as ce:
                logger.warning(f"Could not list containers for image usage check: {ce}")

            used_image_ids = set()
            container_counts_by_image: Dict[str, int] = {}
            for c in containers:
                img_id = getattr(c, "image", None)
                if img_id and hasattr(img_id, "id"):
                    raw_id = img_id.id
                    used_image_ids.add(raw_id)
                    used_image_ids.add(raw_id.replace("sha256:", "")[:12])
                    container_counts_by_image[raw_id] = container_counts_by_image.get(raw_id, 0) + 1

            return [self._format_image(img, used_image_ids, container_counts_by_image) for img in images]
        except Exception as e:
            logger.error(f"Failed to list images: {e}")
            return []

    def _format_image(
        self,
        image,
        used_image_ids: set,
        container_counts: Dict[str, int]
    ) -> Dict[str, Any]:
        """Convert Docker SDK Image to structured payload."""
        tags = image.tags or []
        short_id = image.short_id.replace("sha256:", "")
        full_id = image.id or ""
        attrs = getattr(image, "attrs", {}) or {}

        # Detect dangling / untagged images
        is_dangling = False
        if not tags or any("<none>" in t for t in tags):
            is_dangling = True

        name = "<none>"
        tag = "<none>"
        repository = "<none>"

        if tags:
            first_tag = tags[0]
            if ":" in first_tag:
                parts = first_tag.rsplit(":", 1)
                repository = parts[0]
                name = parts[0]
                tag = parts[1]
            else:
                repository = first_tag
                name = first_tag
                tag = "latest"

        # Check if in use
        is_in_use = (
            full_id in used_image_ids
            or short_id in used_image_ids
            or any(t in used_image_ids for t in tags)
        )
        count = container_counts.get(full_id, 0)

        return {
            "id": short_id,
            "full_id": full_id,
            "name": name,
            "repository": repository,
            "tag": tag,
            "tags": tags,
            "size": attrs.get("Size", 0),
            "created": attrs.get("Created", ""),
            "dangling": is_dangling,
            "in_use": is_in_use,
            "container_count": count,
        }

    def inspect_image(self, image_id: str) -> Dict[str, Any]:
        """Retrieve detailed inspect metadata for an image."""
        self._validate_image_identifier(image_id)
        if not docker_service.is_connected:
            raise ConnectionError("Docker daemon is not connected")

        try:
            image = docker_service._client.images.get(image_id)
            attrs = getattr(image, "attrs", {}) or {}
            config = attrs.get("Config", {}) or {}
            layers = attrs.get("RootFS", {}).get("Layers", [])
            short_id = getattr(image, "short_id", "") or (image.id.replace("sha256:", "")[:12] if getattr(image, "id", None) else image_id)
            size_b = attrs.get("Size", 0)

            return {
                "id": short_id.replace("sha256:", ""),
                "full_id": getattr(image, "id", "") or image_id,
                "tags": image.tags or [],
                "size": size_b,
                "size_bytes": size_b,
                "size_mb": round(size_b / (1024 * 1024), 2),
                "virtual_size": attrs.get("VirtualSize", 0),
                "virtual_size_bytes": attrs.get("VirtualSize", 0),
                "created": attrs.get("Created", ""),
                "docker_version": attrs.get("DockerVersion", ""),
                "os": attrs.get("Os", ""),
                "architecture": attrs.get("Architecture", ""),
                "author": attrs.get("Author", ""),
                "entrypoint": config.get("Entrypoint") or [],
                "cmd": config.get("Cmd") or [],
                "env": config.get("Env") or [],
                "working_dir": config.get("WorkingDir") or "",
                "labels": config.get("Labels") or {},
                "layer_count": len(layers),
                "layers": layers,
                "exposed_ports": list(config.get("ExposedPorts", {}).keys()) if config.get("ExposedPorts") else [],
            }
        except Exception as e:
            logger.error(f"Failed to inspect image {image_id}: {e}")
            raise LookupError(f"Image '{image_id}' not found: {e}")

    def remove_image(self, image_id: str, force: bool = False) -> Dict[str, Any]:
        """Remove an image from the local Docker engine and report reclaimed space."""
        self._validate_image_identifier(image_id)
        if not docker_service.is_connected:
            raise ConnectionError("Docker daemon is not connected")

        # Try to capture size before removal for reclaimed space reporting
        reclaimed_bytes = 0
        try:
            target = docker_service._client.images.get(image_id)
            reclaimed_bytes = getattr(target, "attrs", {}).get("Size", 0)
        except Exception:
            pass

        try:
            docker_service._client.images.remove(image_id, force=force)
            return {
                "success": True,
                "image_id": image_id,
                "reclaimed_bytes": reclaimed_bytes,
                "message": f"Image '{image_id}' removed successfully",
            }
        except Exception as e:
            logger.error(f"Failed to remove image {image_id}: {e}")
            raise RuntimeError(str(e))

    def prune_images(self, dangling_only: bool = True) -> Dict[str, Any]:
        """Prune unused or dangling Docker images and report space reclaimed."""
        if not docker_service.is_connected:
            raise ConnectionError("Docker daemon is not connected")

        try:
            filters = {"dangling": True} if dangling_only else {}
            prune_result = docker_service._client.images.prune(filters=filters)
            deleted = prune_result.get("ImagesDeleted") or []
            reclaimed = prune_result.get("SpaceReclaimed", 0)
            return {
                "success": True,
                "images_deleted_count": len(deleted),
                "images_deleted": deleted,
                "space_reclaimed_bytes": reclaimed,
                "space_reclaimed_mb": round(reclaimed / (1024 * 1024), 2),
                "message": f"Pruned {len(deleted)} image(s), reclaiming {reclaimed} bytes",
            }
        except Exception as e:
            logger.error(f"Failed to prune images: {e}")
            raise RuntimeError(f"Image prune operation failed: {e}")


image_service = ImageService()
