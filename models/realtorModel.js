//db정보받기
const db = require("../config/db.js");

module.exports = {
  getRealtorProfile: async (ra_regno) => {
    try {
      const res = await db.query(
        `
			SELECT agentList.rdealer_nm, agentList.cmp_nm, agentList.address, agent.a_profile_image
			FROM agentList
			LEFT JOIN agent ON agentList.ra_regno = agent.agentList_ra_regno
			WHERE agentList.ra_regno = ?;`,
        [ra_regno]
      );
      return res[0];
    } catch (error) {
      return error;
    }
  },

  getMainInfo: async (ra_regno) => {
    let rawQuery = `
		SELECT ra_regno, a_image1, a_image2, a_image3, a_introduction
		FROM agent
		RIGHT OUTER JOIN agentList
		ON agentList_ra_regno=ra_regno
		WHERE ra_regno = ?;`;
    let res = await db.query(rawQuery, [ra_regno]);
    return res[0][0];
  },

  getEnteredAgent: async (ra_regno) => {
    try {
      const res = await db.query(
        `
			SELECT a_office_hours, contact_number, telno, ra_regno
			FROM agent_contact
			RIGHT OUTER JOIN agentList
			ON agent_contact.agent_agentList_ra_regno = agentList.ra_regno
			LEFT OUTER JOIN agent
			ON agentList.ra_regno = agent.agentList_ra_regno
			WHERE ra_regno = ?;`,
        [ra_regno]
      );
      return res;
    } catch (error) {
      return error;
    }
  },

  getBookmarkByIdnRegno: async (ra_regno, r_id) => {
    try {
      const res = await db.query(
        `SELECT * FROM bookmark WHERE agentList_ra_regno=? AND resident_r_id=?`,
        [ra_regno, r_id]
      );
      return res;
    } catch (error) {
      return error;
    }
  },

  getReviewByRaRegno: async (ra_regno, r_id) => {
    try {
      //입주민 회원이 작성한 후기 평균을 가져오느라 조인 많이~
      let rawQuery = `
			SELECT cmp_nm, ra_regno, rv_id, r_id, r_username, rating, content, tags, avgRRating, DATE_FORMAT(newTable.created_time,'%Y-%m-%d') AS created_time
      FROM agentList
      JOIN(
      SELECT rv_id, r_id, r_username, agentList_ra_regno, rating, tags, content, avgRRating, newTable3.created_time AS created_time
      FROM resident
      JOIN (
      SELECT *
      FROM review
      LEFT OUTER JOIN (
      SELECT resident_r_id AS review_r_id, TRUNCATE(AVG(rating), 1) AS avgRRating
      FROM review
      GROUP BY resident_r_id
      ) newTable2
      ON resident_r_id=review_r_id
      ) newTable3
      ON r_id=resident_r_id
      ) newTable
      ON agentList_ra_regno=ra_regno
      WHERE ra_regno=00754;`;

      let checkOpenedRawQuery = `
			SELECT review_rv_id
			FROM opened_review
			WHERE resident_r_id=?`;

      let checkRPointRawQuery = `
			SELECT r_point
			FROM resident
			WHERE r_id=?`;

      let reviews = await db.query(rawQuery, [ra_regno]);
      let opened = await db.query(checkOpenedRawQuery, [r_id]);
      let rPoint = await db.query(checkRPointRawQuery, [r_id]);
      let canOpen = 1;
      if (rPoint[0][0].r_point < 2) canOpen = 0;
      return { reviews: reviews[0], opened: opened[0], canOpen: canOpen };
    } catch (err) {
      return err;
    }
  },

  //7회 이상 신고된 후기인지 표시하는 check_repo 컬럼 SELECT문에 추가(나쁜후기 0 좋은후기 1)
  getReport: async (params, r_id) => {
    let rawQuery = `
		SELECT repo_rv_id, r_id, agentList_ra_regno,
		CASE
		WHEN repo_rv_id IN (
		SELECT repo_rv_id
		FROM report
		GROUP BY repo_rv_id
		HAVING COUNT(repo_rv_id) >= 7)
		THEN 0
		ELSE 1
		END AS check_repo
		FROM review
		JOIN (
		SELECT repo_rv_id, r_id
		FROM report
		JOIN resident
		ON reporter=r_username
		WHERE r_id=?
		) newTable
		ON rv_id=repo_rv_id
		GROUP BY rv_id
		HAVING agentList_ra_regno=?`;
    let res = await db.query(rawQuery, [r_id, params.ra_regno]);
    return res[0];
  },

  //신고된 후기는 별점 반영X
  getRating: async (params) => {
    let rawQuery = `
		SELECT TRUNCATE(AVG(rating), 1) AS agentRating
		FROM review
		RIGHT OUTER JOIN agentList
		ON agentList_ra_regno=ra_regno
		WHERE ra_regno=? AND rv_id NOT IN (
			SELECT rv_id
			FROM (
			SELECT rv_id, COUNT(rv_id) AS cnt, agentList_ra_regno
			FROM report
			JOIN review
			ON repo_rv_id=rv_id
			WHERE agentList_ra_regno=?
			GROUP BY rv_id
			HAVING cnt >= 7) newTable
		);`;
    let res = await db.query(rawQuery, [params.ra_regno, params.ra_regno]);
    return res[0][0].agentRating;
  },

  insertOpenedReview: async (r_id, rv_id, result) => {
    let insertRawQuery = `
		INSERT
		INTO opened_review(resident_r_id, review_rv_id)
		VALUE(?, ?);
		`;
    let usePointRawQuery = `
		UPDATE resident
		SET r_point=r_point - 2
		WHERE r_id=?;
		`;
    await db.query(insertRawQuery, [r_id, rv_id]);
    await db.query(usePointRawQuery, [r_id]);
    result();
  },

  reportProcess: async (req, r_id) => {
    let rawQuery = `
		INSERT
		INTO report(reporter, repo_rv_id, reportee, reason) 
		VALUES(?, ?, ?, ?)`;
    let getReportee = `
		SELECT r_username
		FROM review
		JOIN resident
		ON resident_r_id=r_id
		WHERE rv_id=?`;
    let getReporter = `
		SELECT r_username
		FROM resident
		WHERE r_id=?`;
    let getRaRegno = `
		SELECT agentList_ra_regno
		FROM review
		WHERE rv_id=?`;

    let reporter = await db.query(getReporter, [r_id]);
    let reportee = await db.query(getReportee, [req.params.rv_id]);
    await db.query(rawQuery, [
      reporter[0][0].r_username,
      req.params.rv_id,
      reportee[0][0].r_username,
      req.query.reason,
    ]);
    return await db.query(getRaRegno, [req.params.rv_id]);
  },

  updateBookmark: async (id, body, result) => {
    let rawQuery = ``;
    let res;

    try {
      if (body.isBookmark !== "0") {
        rawQuery = `DELETE FROM bookmark WHERE bm_id=?`;
        res = await db.query(rawQuery, [body.isBookmark]);
      } else {
        rawQuery = `INSERT INTO bookmark (resident_r_id, agentList_ra_regno) values (?, ?)`;
        res = await db.query(rawQuery, [body.id, body.raRegno]);
      }
      result(res);
    } catch (error) {
      result(null, error);
    }
  },
};
