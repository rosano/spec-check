require_relative "spec_helper"

def check_dir_listing_content_type(content_type)
  content_type.must_match(%r{application\/(ld\+)?json})
  if content_type != "application/ld+json"
    puts "WARNING: the content type \"#{content_type}\" works for directory listings, but the correct one to use is \"application/ld+json\"".yellow
  end
end

describe "public" do

  describe "PUT with a read/write category token to wrong category" do
    it "fails" do
      res = do_put_request("public/othercategory/test-object-simple.json",
                           '{"new": "object"}',
                           { content_type: "application/json" })

      [401, 403].must_include res.code
    end
  end

  describe "DELETE with a read/write category token" do
    it "works" do
      res = do_delete_request("public/#{CONFIG[:category]}/test-object-simple.json")

      [200, 204].must_include res.code
    end
  end

end
