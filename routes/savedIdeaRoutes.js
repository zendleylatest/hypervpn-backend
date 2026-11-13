const express = require("express");
const {
  listSavedIdeas,
  saveIdea,
  deleteSavedIdea,
} = require("../controllers/savedIdeaController");
const { authenticate } = require("../middlewares/authMiddleware");

const router = express.Router();

router.get("/", authenticate, listSavedIdeas);
router.post("/", authenticate, saveIdea);
router.delete("/:id", authenticate, deleteSavedIdea);

module.exports = router;
