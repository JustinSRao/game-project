import Phaser from "phaser";
import { PlayScene } from "./PlayScene.js";

new Phaser.Game({
  type: Phaser.AUTO,
  parent: "app",
  width: 912,
  height: 528,
  backgroundColor: "#0b0c12",
  pixelArt: true,
  scene: [PlayScene],
});
