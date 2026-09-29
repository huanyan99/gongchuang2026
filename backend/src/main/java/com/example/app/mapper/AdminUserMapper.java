package com.example.app.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.example.app.entity.AdminUser;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface AdminUserMapper extends BaseMapper<AdminUser> {

    /** 登录失败计数：在数据库里自增，避免并发登录时读改写丢失计数导致锁定失效 */
    @Update("UPDATE gonghcuang_admin_user SET " +
            "failed_count = CASE WHEN failed_count + 1 >= #{maxFailed} THEN 0 ELSE failed_count + 1 END, " +
            "locked_until = CASE WHEN failed_count + 1 >= #{maxFailed} " +
            "THEN DATE_ADD(NOW(), INTERVAL #{lockMinutes} MINUTE) ELSE locked_until END " +
            "WHERE id = #{id}")
    int recordFailure(@Param("id") Long id, @Param("maxFailed") int maxFailed, @Param("lockMinutes") int lockMinutes);

    /** 登录成功：清空失败计数与锁定 */
    @Update("UPDATE gonghcuang_admin_user SET failed_count = 0, locked_until = NULL, last_login_at = NOW() WHERE id = #{id}")
    int markLoginSuccess(@Param("id") Long id);

    /** 改密：口令在期间被别人改过时不覆盖（口令哈希作为条件） */
    @Update("UPDATE gonghcuang_admin_user SET password_hash = #{newHash}, password_salt = #{newSalt}, " +
            "failed_count = 0, locked_until = NULL " +
            "WHERE id = #{id} AND password_hash = #{expectedHash}")
    int updatePasswordIfHashMatches(@Param("id") Long id, @Param("expectedHash") String expectedHash,
                                    @Param("newSalt") String newSalt, @Param("newHash") String newHash);
}
