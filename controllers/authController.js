const authModel = require("../models/authModel");
// const passwordSchema = require("../models/passwordValidator");
const passwordValidator = require("password-validator");
const passwordSchema = new passwordValidator();
const residentModel = require("../models/residentModel");
const agentModel = require("../models/agentModel");
const jwt = require("jsonwebtoken");

function checkUsernameExists(username, responseToClient) {
  residentModel.getUserByUsername(username, (user) => {
    if (user[0].length !== 0) return responseToClient(true);

    agentModel.getAgentByUsername(username, (user) => {
      responseToClient(user[0].length !== 0);
    });
  });
}

function checkPasswordCorrect(password) {
  const uppercaseRegex = /[A-Z]/;
  const lowercaseRegex = /[a-z]/;
  const numberRegex = /[0-9]/;
  const specialCharRegex = /[!@#$%^&*]/;

  return (
    uppercaseRegex.test(password) &&
    lowercaseRegex.test(password) &&
    numberRegex.test(password) &&
    specialCharRegex.test(password)
  );
}

module.exports = {
  registerView: (req, res) => {
    res.render("users/register");
  },

  registerResident: (req, res) => {
    // Check if required fields are missing
    const body = req.body;
    console.log(!body.username);

    if (
      !body.username ||
      !body.password ||
      !body.phone ||
      !body.realname ||
      !body.email ||
      !body.birth
    ) {
      return res.render("notFound.ejs", { message: "필수 항목 빠짐" });
    }

    if (!checkPasswordCorrect(body.password))
      return res.status(400).send("비밀번호 제약을 확인해주세요");

    checkUsernameExists(body.username, (usernameExists) => {
      if (usernameExists) {
        return res.status(400).send("이미 사용중인 아이디입니다.");
      }

      // Save new user information to the database
      authModel.registerResident(req.body, (userId) => {
        // Error during registration
        if (!userId) {
          return res.status(400).send("회원가입 실패");
        }

        const token = jwt.sign({ userId }, process.env.JWT_SECRET_KEY);
        // Store user's userId in the cookie upon successful registration
        res
          .cookie("authToken", token, {
            maxAge: 86400_000,
            httpOnly: true,
          })
          .redirect("/");
      });
    });
  },

  registerResidentView: (req, res) => {
    res.render("users/resident/register");
  },

  registerAgent: (req, res) => {
    // Check if required fields are missing
    const body = req.body;

    if (
      !body.username ||
      !body.password ||
      !body.realname ||
      !body.email ||
      !body.phone ||
      !body.agentList_ra_regno
    ) {
      return res.render("notFound.ejs", { message: "필수 항목 빠짐" });
    }

    if (!checkPasswordCorrect(body.password))
      return res.status(400).send("비밀번호 제약을 확인해주세요");

    checkUsernameExists(body.username, (usernameExists) => {
      if (usernameExists) {
        return res.status(400).send("이미 사용중인 아이디입니다.");
      }

      // Save new agent information to the database
      authModel.registerAgent(req.body, (userId) => {
        if (!userId) {
          return res.status(400).send("회원가입 실패");
        }
        const token = jwt.sign({ userId }, process.env.JWT_SECRET_KEY);
        // Store agent's userId in the cookie upon successful registration
        res
          .cookie("authToken", token, {
            maxAge: 86400_000,
            httpOnly: true,
          })
          .redirect("/");
      });
    });
  },

  registerAgentView: (req, res) => {
    res.render("users/agent/register");
  },

  login: (req, res) => {
    // Check if required fields are missing
    const body = req.body;

    if (!body.username || !body.password) {
      return res.render("notFound.ejs", { message: "필수 항목 빠짐" });
    }

    // Login
    authModel.getUser(req.body, (userId, isAgent) => {
      // Error during login
      if (!userId) {
        return res.render("users/login");
      }
      const token = jwt.sign({ userId }, process.env.JWT_SECRET_KEY);
      // Store user/agent's userId in the cookie upon successful login
      res.cookie("authToken", token, {
        maxAge: 86400_000,
        httpOnly: true,
      });
      res
        .cookie("userType", isAgent ? 0 : 1, {
          maxAge: 86400_000,
          httpOnly: true,
        })
        .redirect("/");
    });
  },

  loginView: (req, res) => {
    res.render("users/login");
  },

  logout: (req, res) => {
    res.clearCookie("authToken").redirect("/");
  },
};
